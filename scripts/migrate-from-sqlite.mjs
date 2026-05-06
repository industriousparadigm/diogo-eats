// One-shot data migration: reads the local SQLite DB and photo files,
// pushes them into Supabase. Idempotent in spirit (uses upsert) but
// designed to be run once, after which `data/` can be archived.
//
// Usage:
//   cd ~/Dev/Personal/eats && node scripts/migrate-from-sqlite.mjs
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (loaded from .env).

import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const DB_PATH = path.join(ROOT, "data", "eats.db");
const PHOTOS_DIR = path.join(ROOT, "data", "photos");

// Crude .env loader so we don't drag in dotenv.
const env = fs
  .readFileSync(path.join(ROOT, ".env"), "utf-8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .reduce((acc, line) => {
    const [k, ...rest] = line.split("=");
    acc[k.trim()] = rest.join("=").trim();
    return acc;
  }, {});

const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  console.log("no SQLite DB at", DB_PATH, "— nothing to migrate");
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function dumpJson(query) {
  const out = execSync(`sqlite3 -json "${DB_PATH}" "${query}"`, { encoding: "utf-8" }).trim();
  return out ? JSON.parse(out) : [];
}

const meals = dumpJson("SELECT * FROM meals");
const memory = dumpJson("SELECT * FROM food_memory");

console.log(`found ${meals.length} meals, ${memory.length} memory entries`);

// 1) Upload photos that exist on disk.
let uploaded = 0;
for (const m of meals) {
  if (!m.photo_filename) continue;
  const filePath = path.join(PHOTOS_DIR, m.photo_filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`  photo missing on disk: ${m.photo_filename}`);
    continue;
  }
  const buf = fs.readFileSync(filePath);
  const { error } = await supabase.storage
    .from("photos")
    .upload(m.photo_filename, buf, { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.warn(`  upload failed for ${m.photo_filename}:`, error.message);
  } else {
    uploaded++;
  }
}
console.log(`uploaded ${uploaded} photos`);

// 2) Insert meals. Drop the SQLite-only `is_plant_based` column if present.
const cleanMeals = meals.map((m) => {
  const { is_plant_based, ...rest } = m;
  return rest;
});
if (cleanMeals.length > 0) {
  const { error } = await supabase.from("meals").upsert(cleanMeals, { onConflict: "id" });
  if (error) {
    console.error("meals upsert failed:", error.message);
    process.exit(1);
  }
  console.log(`upserted ${cleanMeals.length} meals`);
}

// 3) Insert food_memory.
if (memory.length > 0) {
  const { error } = await supabase
    .from("food_memory")
    .upsert(memory, { onConflict: "name_key" });
  if (error) {
    console.error("food_memory upsert failed:", error.message);
    process.exit(1);
  }
  console.log(`upserted ${memory.length} food_memory entries`);
}

console.log("done.");
