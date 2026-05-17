// Local backup script. Dumps the meals + food_memory tables to a
// date-stamped JSON file under backups/. Photos are NOT included
// here — they live in Supabase Storage and have their own retention.
//
// Run manually before any DB-touching work:
//   cd ~/Dev/Personal/eats && npm run dump-meals
//
// Also wired into the production cron at /api/cron/backup, which
// writes the same payload to Vercel Blob.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const BACKUPS_DIR = path.join(ROOT, "backups");

const env = fs
  .readFileSync(path.join(ROOT, ".env"), "utf-8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .reduce((acc, line) => {
    const [k, ...rest] = line.split("=");
    acc[k.trim()] = rest.join("=").trim().replace(/^"(.*)"$/, "$1");
    return acc;
  }, {});

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supa = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  console.log("Fetching meals…");
  const { data: meals, error: mErr } = await supa
    .from("meals")
    .select("*")
    .order("created_at", { ascending: true });
  if (mErr) throw new Error(`meals fetch failed: ${mErr.message}`);

  console.log("Fetching food_memory…");
  const { data: memory, error: fErr } = await supa
    .from("food_memory")
    .select("*")
    .order("last_seen", { ascending: true });
  if (fErr) throw new Error(`food_memory fetch failed: ${fErr.message}`);

  const now = new Date();
  const iso = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19); // 2026-05-17_18-05-12

  const payload = {
    schema_version: 1,
    taken_at: now.toISOString(),
    taken_at_local: now.toString(),
    counts: { meals: meals?.length ?? 0, food_memory: memory?.length ?? 0 },
    meals: meals ?? [],
    food_memory: memory ?? [],
  };

  const fname = `meals-backup-${iso}.json`;
  const fpath = path.join(BACKUPS_DIR, fname);
  fs.writeFileSync(fpath, JSON.stringify(payload, null, 2));

  const sizeKb = Math.round(fs.statSync(fpath).size / 1024);
  console.log(`✓ Wrote ${fname} (${sizeKb}KB) — ${payload.counts.meals} meals, ${payload.counts.food_memory} memory rows.`);
  console.log(`  ${fpath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
