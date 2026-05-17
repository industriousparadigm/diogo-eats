// One-shot backfill: creates Diogo's auth user, stamps every existing
// meal + food_memory row with his user_id, and inserts his
// user_profiles row with the current default targets.
//
// Safe to re-run: it's idempotent. Looks up the user by email each
// time; updates rows whose user_id is still NULL.
//
//   cd ~/Dev/Personal/eats && node scripts/backfill-diogo-user.mjs

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const env = fs
  .readFileSync(path.join(ROOT, ".env"), "utf-8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .reduce((acc, line) => {
    const [k, ...rest] = line.split("=");
    acc[k.trim()] = rest.join("=").trim().replace(/^"(.*)"$/, "$1");
    return acc;
  }, {});

const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DIOGO_EMAIL = "diogo@okrasolar.com";

async function findOrCreateDiogo() {
  // listUsers returns paginated; for a tiny project the first page is fine.
  const { data, error } = await supa.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const existing = data.users.find((u) => u.email?.toLowerCase() === DIOGO_EMAIL);
  if (existing) {
    console.log(`✓ Diogo's auth user already exists: ${existing.id}`);
    return existing.id;
  }
  console.log("Creating Diogo's auth user…");
  const { data: created, error: cErr } = await supa.auth.admin.createUser({
    email: DIOGO_EMAIL,
    email_confirm: true,
  });
  if (cErr) throw new Error(`createUser failed: ${cErr.message}`);
  console.log(`✓ Created: ${created.user.id}`);
  return created.user.id;
}

async function stampMeals(userId) {
  const { data, error } = await supa
    .from("meals")
    .update({ user_id: userId })
    .is("user_id", null)
    .select("id");
  if (error) throw new Error(`stampMeals failed: ${error.message}`);
  console.log(`✓ Stamped ${data?.length ?? 0} meals.`);
}

async function stampFoodMemory(userId) {
  const { data, error } = await supa
    .from("food_memory")
    .update({ user_id: userId })
    .is("user_id", null)
    .select("name_key");
  if (error) throw new Error(`stampFoodMemory failed: ${error.message}`);
  console.log(`✓ Stamped ${data?.length ?? 0} food_memory rows.`);
}

async function ensureProfile(userId) {
  const { data: existing } = await supa
    .from("user_profiles")
    .select("user_id, onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    console.log(
      `✓ user_profiles row already exists for Diogo (onboarded_at=${existing.onboarded_at}).`
    );
    return;
  }
  const now = Date.now();
  // Seed Diogo with his current calibrated targets + a notes blurb
  // capturing the LDL context so Vision parses keep their tone.
  const { error } = await supa.from("user_profiles").insert({
    user_id: userId,
    email: DIOGO_EMAIL,
    sex: "M",
    age: 33,
    weight_kg: 78,
    notes:
      "LDL 142, HDL 75, trigs 71, A1c 5.5. Strong genetic LDL signal (father MI/bypass at 49). Vegan-leaning, low-saturated-fat protocol aimed at lowering LDL by the September 2026 cardio retest with Sergio Machado Leite. Strength training is a known gap. Celebrate plant + fiber wins; flag sat fat only when meaningfully off.",
    sat_fat_g: 18,
    soluble_fiber_g: 10,
    calories: 2000,
    protein_g: 90,
    onboarded_at: now,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(`insert profile failed: ${error.message}`);
  console.log("✓ Inserted Diogo's user_profiles row.");
}

async function main() {
  const userId = await findOrCreateDiogo();
  await stampMeals(userId);
  await stampFoodMemory(userId);
  await ensureProfile(userId);
  console.log("\nAll done. Run the follow-up tightening migration next.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
