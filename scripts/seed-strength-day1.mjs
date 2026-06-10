// Seed the strength day-1 baseline: Diogo's real first gym session,
// 10 Jun 2026, ~08:30 → 09:30 Europe/Lisbon (UTC+1 in June, so
// 07:30 → 08:30 UTC). Numbers transcribed from the Notes-app dump the
// strength feature replaces (spec section 5).
//
// The exercise catalog itself is seeded by the migration
// (20260610130000_strength.sql) — single source of truth. This script
// only verifies the catalog is present, then inserts the one user
// session.
//
// Idempotent: the session row uses a fixed UUID, so re-running detects
// the existing row and exits without duplicating anything.
//
//   cd ~/Dev/Personal/eats && node scripts/seed-strength-day1.mjs

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

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supa = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DIOGO_USER_ID = "47053402-614f-4a7d-bf36-54b9f3337bbe"; // lib/user.ts
const SEED_SESSION_ID = "d1ba5e11-2026-4610-8a30-000000000001"; // fixed = idempotency key

// 10 Jun 2026: Lisbon runs WEST (UTC+1).
const STARTED_AT = Date.UTC(2026, 5, 10, 7, 30); // 08:30 Lisbon
const COMPLETED_AT = Date.UTC(2026, 5, 10, 8, 30); // 09:30 Lisbon
const NOTE = "10min warmup run, 22min run after, ~10min banho turco.";

const EXPECTED_EXERCISES = [
  "leg-press",
  "back-extension",
  "chest-press",
  "seated-row",
  "farmers-carry",
];

// [exercise_id, series_index, weight_kg, reps] in logged order.
// position = array index, which drives next session's picker order.
const SETS = [
  ["leg-press", 1, 32, 12],
  ["leg-press", 2, 39, 12],
  ["back-extension", 1, null, 12],
  ["back-extension", 2, null, 12],
  ["chest-press", 1, 32, 12],
  ["chest-press", 2, 32, 12],
  ["seated-row", 1, 25, 12],
  ["seated-row", 2, 32, 12],
  ["farmers-carry", 1, 16, 60], // kg per hand; reps column = steps
  ["farmers-carry", 2, 16, 60],
];

async function main() {
  // 1. Catalog present? (Fails loudly if the migration hasn't run.)
  const { data: catalog, error: catErr } = await supa
    .from("strength_exercises")
    .select("id")
    .order("sort_order", { ascending: true });
  if (catErr) throw new Error(`catalog read failed: ${catErr.message}`);
  const ids = (catalog ?? []).map((e) => e.id);
  const missing = EXPECTED_EXERCISES.filter((id) => !ids.includes(id));
  if (missing.length > 0) {
    throw new Error(
      `catalog incomplete — missing ${missing.join(", ")}. Run the migration first (supabase db push).`
    );
  }
  console.log(`catalog: ${ids.length} exercises (${ids.join(", ")})`);

  // 2. Already seeded?
  const { data: existing, error: exErr } = await supa
    .from("strength_sessions")
    .select("id, started_at, completed_at")
    .eq("id", SEED_SESSION_ID)
    .maybeSingle();
  if (exErr) throw new Error(`session check failed: ${exErr.message}`);
  if (existing) {
    const { count } = await supa
      .from("strength_sets")
      .select("id", { count: "exact", head: true })
      .eq("session_id", SEED_SESSION_ID);
    console.log(
      `day-1 session already seeded (${SEED_SESSION_ID}, ${count} sets) — nothing to do.`
    );
    return;
  }

  // 3. Insert session, then sets. On a sets failure remove the orphan
  // session row so a re-run starts clean (same recovery as lib/strength/db.ts).
  const { error: sErr } = await supa.from("strength_sessions").insert({
    id: SEED_SESSION_ID,
    user_id: DIOGO_USER_ID,
    started_at: STARTED_AT,
    completed_at: COMPLETED_AT,
    note: NOTE,
  });
  if (sErr) throw new Error(`session insert failed: ${sErr.message}`);

  const setRows = SETS.map(([exercise_id, series_index, weight_kg, reps], i) => ({
    user_id: DIOGO_USER_ID,
    session_id: SEED_SESSION_ID,
    exercise_id,
    position: i,
    series_index,
    weight_kg,
    reps,
  }));
  const { error: setErr } = await supa.from("strength_sets").insert(setRows);
  if (setErr) {
    await supa.from("strength_sessions").delete().eq("id", SEED_SESSION_ID);
    throw new Error(`sets insert failed (session rolled back): ${setErr.message}`);
  }

  // 4. Read back and report.
  const { data: check } = await supa
    .from("strength_sets")
    .select("exercise_id, series_index, weight_kg, reps")
    .eq("session_id", SEED_SESSION_ID)
    .order("position", { ascending: true });
  console.log(
    `seeded day-1 baseline: session ${SEED_SESSION_ID}`,
    `\n  started   ${new Date(STARTED_AT).toISOString()} (08:30 Lisbon)`,
    `\n  completed ${new Date(COMPLETED_AT).toISOString()} (09:30 Lisbon)`,
    `\n  note      ${NOTE}`
  );
  for (const s of check ?? []) {
    console.log(
      `  ${s.exercise_id} s${s.series_index}: ${s.weight_kg ?? "bw"}${
        s.weight_kg != null ? "kg" : ""
      } x ${s.reps}`
    );
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
