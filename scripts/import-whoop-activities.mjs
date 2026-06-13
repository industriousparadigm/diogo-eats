// Backfill Whoop workouts into the Movement tab's `activities` table.
//
// Source of truth is the `whoop_workouts` table (already synced from the
// Whoop API), NOT a cached JSON: it carries the real upstream UUID
// (whoop_workout_id) and exact ms-epoch started_at/ended_at, so timezones
// and the dedupe key are unambiguous. No Whoop API call is made here.
//
// Rules (Diogo: "be reasonable, don't register 10 min walks or anything
// short and seemingly buggy"):
//   - DROP   any workout under its duration floor (short / buggy noise):
//            MIN_DURATION_MIN for recognised sports, the higher
//            MIN_UNDEFINED_MIN for Whoop's generic unlabelled "activity"
//            (type 'other' + null label) — the noisiest category.
//   - SKIP   any workout overlapping a logged gym (strength_sessions)
//            window — it's part of that session, importing it double-counts.
//   - MERGE  today's padel into Diogo's existing manual row (keep his
//            label/effort/duration, just attach the Whoop id + fix the
//            placeholder start hour).
//   - IMPORT the rest as source='whoop' rows, effort=null (strain is a
//            measurement, not a felt effort — he curates effort later).
//
// Idempotent: dedupes on the Whoop UUID across ALL existing activities, so
// re-running is a no-op. Dry-run by default; pass --apply to write.
//
//   cd ~/Dev/Personal/eats && node scripts/import-whoop-activities.mjs          # plan
//   cd ~/Dev/Personal/eats && node scripts/import-whoop-activities.mjs --apply  # write

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

const APPLY = process.argv.includes("--apply");
const DIOGO = "47053402-614f-4a7d-bf36-54b9f3337bbe";
const MERGE_ROW_ID = "ac71d017-2026-4612-9ad0-000000000001"; // seeded manual padel (12 Jun)
const MIN_DURATION_MIN = 20; // default floor for recognised sports
const MIN_UNDEFINED_MIN = 30; // higher floor for Whoop's generic unlabelled "activity"

// Whoop sport_name -> our activity type. Generic "activity" and the
// CrossFit-style "functional-fitness" have no dedicated type → 'other';
// functional-fitness keeps a label so it's recognisable on curation.
const SPORT_TYPE = {
  "paddle-tennis": "padel",
  running: "run",
  walking: "walk",
  "functional-fitness": "other",
  activity: "other",
};
const SPORT_LABEL = { "functional-fitness": "functional fitness" };

const lisbon = (ts) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(ts));
const lisbonDay = (ts) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ts));

async function main() {
  const [{ data: workouts }, { data: sessions }, { data: acts }] = await Promise.all([
    supa.from("whoop_workouts")
      .select("whoop_workout_id, started_at, ended_at, sport_name, strain, kcal")
      .eq("user_id", DIOGO).order("started_at", { ascending: false }),
    supa.from("strength_sessions")
      .select("started_at, completed_at").eq("user_id", DIOGO),
    supa.from("activities")
      .select("id, started_at, type, label, duration_min, effort, source, external_id")
      .eq("user_id", DIOGO),
  ]);

  const gymWindows = (sessions ?? []).map((s) => [s.started_at, s.completed_at]);
  const existingExtIds = new Set((acts ?? []).map((a) => a.external_id).filter(Boolean));
  const mergeRow = (acts ?? []).find((a) => a.id === MERGE_ROW_ID) ?? null;

  const overlapsGym = (start, end) =>
    gymWindows.some(([gs, ge]) => start < ge && end > gs);

  const plan = { merge: null, import: [], drop: [], skipGym: [], already: [] };

  for (const w of workouts ?? []) {
    const dur = Math.round((w.ended_at - w.started_at) / 60000);
    const type = SPORT_TYPE[w.sport_name] ?? "other";
    const label = SPORT_LABEL[w.sport_name] ?? null;
    const tag = `${lisbon(w.started_at)}  ${String(w.sport_name).padEnd(18)} ${String(dur).padStart(3)}min  strain ${Number(w.strain).toFixed(1)}  ${Math.round(w.kcal)}kcal`;

    // Already imported (idempotent re-run / the merge target)?
    if (existingExtIds.has(w.whoop_workout_id)) { plan.already.push(tag); continue; }

    // Merge: today's padel into the seeded manual row.
    if (
      mergeRow && type === "padel" &&
      lisbonDay(w.started_at) === lisbonDay(mergeRow.started_at) &&
      !mergeRow.external_id
    ) {
      plan.merge = { w, dur, tag };
      continue;
    }

    // Duration floor. Whoop's generic "activity" sport (type 'other' with no
    // label) is the noisiest — an unlabelled "activity" must clear a higher
    // 30-min floor before it's worth importing. functional-fitness carries
    // the "functional fitness" label, so it stays on the normal 20-min floor.
    const floor =
      type === "other" && label === null ? MIN_UNDEFINED_MIN : MIN_DURATION_MIN;
    if (dur < floor) {
      plan.drop.push(`${tag}  (< ${floor}min floor)`);
      continue;
    }
    if (overlapsGym(w.started_at, w.ended_at)) { plan.skipGym.push(tag); continue; }

    plan.import.push({
      row: {
        user_id: DIOGO,
        type,
        label,
        started_at: w.started_at,
        duration_min: dur,
        effort: null,
        distance_km: null,
        note: `Whoop: strain ${Number(w.strain).toFixed(1)}, ${Math.round(w.kcal)} kcal`,
        strain: Number(Number(w.strain).toFixed(1)),
        source: "whoop",
        external_id: w.whoop_workout_id,
      },
      tag: `${tag}  ->  ${type}`,
    });
  }

  // ---- report ----
  const line = (s) => console.log("  " + s);
  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN (pass --apply to write)"} — ${(workouts ?? []).length} whoop_workouts, ${gymWindows.length} gym sessions\n`);

  console.log(`IMPORT (${plan.import.length}) as source='whoop', effort=null:`);
  plan.import.forEach((p) => line(p.tag));

  console.log(`\nMERGE into manual padel row ${MERGE_ROW_ID}:`);
  if (plan.merge) {
    line(plan.merge.tag);
    line(`-> keep label='${mergeRow.label}', effort='${mergeRow.effort}', duration=${mergeRow.duration_min}min (his inputs)`);
    line(`-> set external_id=${plan.merge.w.whoop_workout_id}, started_at ${lisbon(mergeRow.started_at)} -> ${lisbon(plan.merge.w.started_at)} (placeholder fix)`);
    line(`   NOTE: Whoop measured ${plan.merge.dur}min vs his stated ${mergeRow.duration_min}min — keeping his; say the word to switch.`);
  } else {
    line(mergeRow?.external_id ? "already merged (external_id set) — no-op" : "no merge candidate found");
  }

  console.log(`\nDROP (${plan.drop.length}) — under floor (${MIN_DURATION_MIN}min default, ${MIN_UNDEFINED_MIN}min for unlabelled "activity"):`);
  plan.drop.forEach(line);

  console.log(`\nSKIP (${plan.skipGym.length}) — overlaps a logged gym session (already counted):`);
  plan.skipGym.forEach(line);

  console.log(`\nALREADY PRESENT (${plan.already.length}) — external_id already in activities:`);
  plan.already.forEach(line);

  if (!APPLY) {
    console.log(`\n(dry run — nothing written)`);
    return;
  }

  // ---- write ----
  if (plan.import.length > 0) {
    const { data, error } = await supa
      .from("activities")
      .insert(plan.import.map((p) => p.row))
      .select("id");
    if (error) throw new Error(`import insert: ${error.message}`);
    console.log(`\nINSERTED ${data.length} activities.`);
  }

  if (plan.merge) {
    const { error } = await supa
      .from("activities")
      .update({
        external_id: plan.merge.w.whoop_workout_id,
        started_at: plan.merge.w.started_at,
        note: `Whoop: strain ${Number(plan.merge.w.strain).toFixed(1)}, ${Math.round(plan.merge.w.kcal)} kcal`,
        strain: Number(Number(plan.merge.w.strain).toFixed(1)),
      })
      .eq("id", MERGE_ROW_ID)
      .eq("user_id", DIOGO);
    if (error) throw new Error(`merge update: ${error.message}`);
    console.log(`MERGED Whoop id into ${MERGE_ROW_ID}.`);
  }

  console.log(`\nDone.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
