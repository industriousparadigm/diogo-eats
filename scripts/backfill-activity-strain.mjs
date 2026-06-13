// Backfill the new `activities.strain` column from already-synced Whoop data.
//
// After the 20260613090000 migration added `strain real` to activities, the
// rows imported by import-whoop-activities.mjs (and the merged manual padel
// row) carry the right external_id but a NULL strain. This script fills it
// from the source `whoop_workouts` table, matching on
//   activities.external_id = whoop_workouts.whoop_workout_id
// and writing the workout's strain rounded to 1 dp (same rounding the
// importer now uses).
//
// Idempotent: it only touches rows where strain IS NULL, so a re-run is a
// no-op once everything's filled.
//
//   cd ~/Dev/Personal/eats && node scripts/backfill-activity-strain.mjs

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

const DIOGO = "47053402-614f-4a7d-bf36-54b9f3337bbe";

const lisbonDay = (ts) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));

async function main() {
  // Rows that need a strain: imported/merged rows (external_id set) with a
  // NULL strain. Manual rows (external_id NULL) are intentionally left alone.
  const { data: rows, error: rowsErr } = await supa
    .from("activities")
    .select("id, type, started_at, strain, external_id")
    .eq("user_id", DIOGO)
    .not("external_id", "is", null)
    .is("strain", null)
    .order("started_at", { ascending: false });
  if (rowsErr) throw new Error(`load activities: ${rowsErr.message}`);

  if (!rows || rows.length === 0) {
    console.log("No strain-null rows with an external_id — nothing to backfill.");
    return;
  }

  // Pull the matching workouts in one query.
  const extIds = rows.map((r) => r.external_id);
  const { data: workouts, error: wErr } = await supa
    .from("whoop_workouts")
    .select("whoop_workout_id, strain")
    .eq("user_id", DIOGO)
    .in("whoop_workout_id", extIds);
  if (wErr) throw new Error(`load whoop_workouts: ${wErr.message}`);

  const strainByWorkout = new Map(
    (workouts ?? []).map((w) => [w.whoop_workout_id, w.strain])
  );

  console.log(`\nBackfilling strain on ${rows.length} row(s):\n`);
  console.log("  date        type      strain set");
  console.log("  ----------  --------  ----------");

  let updated = 0;
  let missing = 0;
  for (const r of rows) {
    const raw = strainByWorkout.get(r.external_id);
    if (raw === undefined || raw === null) {
      console.log(
        `  ${lisbonDay(r.started_at)}  ${String(r.type).padEnd(8)}  (no matching whoop_workout — skipped)`
      );
      missing++;
      continue;
    }
    const strain = Number(Number(raw).toFixed(1));
    const { error: upErr } = await supa
      .from("activities")
      .update({ strain })
      .eq("id", r.id)
      .eq("user_id", DIOGO);
    if (upErr) throw new Error(`update ${r.id}: ${upErr.message}`);
    console.log(
      `  ${lisbonDay(r.started_at)}  ${String(r.type).padEnd(8)}  ${strain}`
    );
    updated++;
  }

  console.log(
    `\nDone. ${updated} row(s) updated${missing ? `, ${missing} skipped (no source workout)` : ""}.`
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
