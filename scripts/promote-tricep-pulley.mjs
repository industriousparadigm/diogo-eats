// Promote the tricep pulley from a freeform session note to a first-class
// exercise + logged sets — Diogo's REAL data, with explicit approval.
//
// The story: on 11 Jun 2026 the seated row was taken, so Diogo improvised a
// tricep pulley (2× 27kg × 12). The app had no way to add an exercise or
// swap one in, so the work survived only as a note:
//   "Seated row was taken so I did a tricep pulley 2x 27kg 12reps"
// The picker overhaul fixes that going forward. This script back-fills the
// history so the new feature has the data it always should have had.
//
// Two writes against PROD (service role, .env SUPABASE_SERVICE_ROLE_KEY):
//   1. Create the exercise `tricep-pulley` (weight_reps, image_key set so
//      the bundled cable-pushdown photo renders, created_by = Diogo).
//   2. Append two sets to his 11 Jun morning session, AFTER the existing 8
//      (positions 8 and 9, series_index 1 and 2): 27kg × 12 each.
//
// His note is left exactly as-is — it's history, and it's the very thing
// this script honors.
//
// IDEMPOTENT: the exercise uses a fixed id and the sets are matched by
// (session_id, exercise_id), so a re-run detects both and changes nothing.
// PROOF: prints the session's set rows BEFORE and AFTER (count 8→10, every
// pre-existing row byte-identical), and confirms no OTHER session of his was
// touched.
//
//   cd ~/Dev/Personal/eats && node scripts/promote-tricep-pulley.mjs
//
// Add --dry-run to print the before-state + the planned writes WITHOUT
// touching prod.

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

const DRY_RUN = process.argv.includes("--dry-run");

const supa = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DIOGO_USER_ID = "47053402-614f-4a7d-bf36-54b9f3337bbe"; // lib/user.ts
// His 11 Jun morning session (started ~07:35 Lisbon, the 3-beat one). Found
// by inspection: it's the only 11 Jun session and its note records the
// tricep pulley.
const SESSION_ID = "667d935a-8659-4631-a56d-08b9aaa2285e";

const EXERCISE = {
  id: "tricep-pulley",
  name: "Tricep pulley",
  description:
    "Elbows pinned to your sides, push the bar down, control the way up.",
  measurement_type: "weight_reps",
  image_key: "tricep-pulley", // bundled asset: assets/exercises/tricep-pulley.jpg
  created_by: DIOGO_USER_ID,
  sort_order: null, // filled in below = max + 1
};

// The two sets to append, in logged order. [series_index, weight_kg, reps].
const NEW_SETS = [
  [1, 27, 12],
  [2, 27, 12],
];

// A stable JSON view of a set row for byte-identical before/after comparison
// (ignores the surrogate `id` which is DB-assigned and irrelevant to identity).
function setKey(row) {
  return JSON.stringify({
    exercise_id: row.exercise_id,
    position: row.position,
    series_index: row.series_index,
    weight_kg: row.weight_kg,
    reps: row.reps,
  });
}

function printSets(label, rows) {
  console.log(`\n${label} (${rows.length} sets):`);
  for (const r of rows) {
    console.log(
      `  pos=${r.position}  ${r.exercise_id}  s${r.series_index}  ` +
        `${r.weight_kg == null ? "bw" : r.weight_kg + "kg"} × ${r.reps}`
    );
  }
}

async function readSessionSets(sessionId) {
  const { data, error } = await supa
    .from("strength_sets")
    .select("position, exercise_id, series_index, weight_kg, reps")
    .eq("session_id", sessionId)
    .order("position", { ascending: true });
  if (error) throw new Error(`read sets failed: ${error.message}`);
  return data ?? [];
}

async function main() {
  console.log(
    DRY_RUN ? "=== DRY RUN — no writes ===" : "=== PROMOTE tricep pulley (LIVE) ==="
  );

  // ---- guard: session exists and belongs to Diogo ----
  const { data: session, error: sErr } = await supa
    .from("strength_sessions")
    .select("id, user_id, started_at, note")
    .eq("id", SESSION_ID)
    .maybeSingle();
  if (sErr) throw new Error(`session read failed: ${sErr.message}`);
  if (!session) throw new Error(`session ${SESSION_ID} not found — wrong id?`);
  if (session.user_id !== DIOGO_USER_ID) {
    throw new Error(`session ${SESSION_ID} is not Diogo's — refusing to touch`);
  }
  console.log(
    `target session: ${SESSION_ID}\n` +
      `  started ${new Date(session.started_at).toISOString()}\n` +
      `  note    ${JSON.stringify(session.note)}`
  );

  // ---- snapshot OTHER sessions' set fingerprints (untouched proof) ----
  const { data: allMine, error: allErr } = await supa
    .from("strength_sessions")
    .select("id")
    .eq("user_id", DIOGO_USER_ID);
  if (allErr) throw new Error(`sessions read failed: ${allErr.message}`);
  const otherSessionIds = (allMine ?? [])
    .map((s) => s.id)
    .filter((id) => id !== SESSION_ID);
  const otherBefore = {};
  for (const id of otherSessionIds) {
    otherBefore[id] = (await readSessionSets(id)).map(setKey).sort();
  }

  // ---- before ----
  const before = await readSessionSets(SESSION_ID);
  printSets("BEFORE", before);

  // ---- step 1: exercise (idempotent) ----
  const { data: existingEx } = await supa
    .from("strength_exercises")
    .select("id, name, measurement_type, image_key, created_by, sort_order")
    .eq("id", EXERCISE.id)
    .maybeSingle();

  if (existingEx) {
    console.log(`\nexercise ${EXERCISE.id} already exists — leaving as-is.`);
  } else {
    const { data: maxRow } = await supa
      .from("strength_exercises")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortOrder = (maxRow?.sort_order ?? 0) + 1;
    if (DRY_RUN) {
      console.log(
        `\n[dry-run] would INSERT exercise ${EXERCISE.id} ` +
          `(sort_order ${sortOrder}, image_key ${EXERCISE.image_key}, created_by Diogo)`
      );
    } else {
      const { error: insErr } = await supa.from("strength_exercises").insert({
        ...EXERCISE,
        sort_order: sortOrder,
      });
      if (insErr) throw new Error(`exercise insert failed: ${insErr.message}`);
      console.log(`\ninserted exercise ${EXERCISE.id} (sort_order ${sortOrder}).`);
    }
  }

  // ---- step 2: sets (idempotent, appended after the existing rows) ----
  const alreadyLogged = before.some((r) => r.exercise_id === EXERCISE.id);
  if (alreadyLogged) {
    console.log(
      `\ntricep-pulley sets already present in this session — nothing to add.`
    );
  } else {
    const startPos = before.length; // append after the existing rows (0-indexed positions)
    const setRows = NEW_SETS.map(([series_index, weight_kg, reps], i) => ({
      user_id: DIOGO_USER_ID,
      session_id: SESSION_ID,
      exercise_id: EXERCISE.id,
      position: startPos + i,
      series_index,
      weight_kg,
      reps,
    }));
    if (DRY_RUN) {
      console.log("\n[dry-run] would INSERT sets:");
      for (const r of setRows) {
        console.log(
          `  pos=${r.position}  ${r.exercise_id}  s${r.series_index}  ${r.weight_kg}kg × ${r.reps}`
        );
      }
    } else {
      const { error: setErr } = await supa.from("strength_sets").insert(setRows);
      if (setErr) throw new Error(`sets insert failed: ${setErr.message}`);
      console.log(`\nappended ${setRows.length} sets at positions ${startPos}, ${startPos + 1}.`);
    }
  }

  if (DRY_RUN) {
    console.log("\n=== DRY RUN complete — prod unchanged ===");
    return;
  }

  // ---- after ----
  const after = await readSessionSets(SESSION_ID);
  printSets("AFTER", after);

  // ---- proof: the 8 pre-existing rows are byte-identical ----
  const beforeKeys = before.map(setKey);
  const afterKeys = after.map(setKey);
  const preservedOk = beforeKeys.every((k, i) => afterKeys[i] === k);
  console.log(
    `\nset count: ${before.length} → ${after.length}` +
      `  (expected 8 → 10: ${before.length === 8 && after.length === 10 ? "OK" : "CHECK"})`
  );
  console.log(
    `pre-existing rows byte-identical (same order, unchanged): ${preservedOk ? "OK" : "MISMATCH"}`
  );
  if (!preservedOk) {
    console.log("  BEFORE:", beforeKeys);
    console.log("  AFTER :", afterKeys.slice(0, before.length));
  }

  // ---- proof: no other session of his was touched ----
  let othersUntouched = true;
  for (const id of otherSessionIds) {
    const now = (await readSessionSets(id)).map(setKey).sort();
    const was = otherBefore[id];
    const same = now.length === was.length && now.every((k, i) => k === was[i]);
    if (!same) {
      othersUntouched = false;
      console.log(`  OTHER SESSION CHANGED: ${id}`);
    }
  }
  console.log(
    `other sessions untouched (${otherSessionIds.length} checked): ${othersUntouched ? "OK" : "MISMATCH"}`
  );

  console.log("\n=== done ===");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
