// One-time live runner for the generalised Whoop → activities import.
//
// No TS runner in this repo, so the planner logic from lib/whoopActivityImport.ts
// is replicated here (it's small) for a single authorized, idempotent apply
// against Diogo's prod data. Dry-run by default; pass --apply to write.
//
//   cd ~/Dev/Personal/eats && node scripts/run-whoop-pull.mjs          # plan
//   cd ~/Dev/Personal/eats && node scripts/run-whoop-pull.mjs --apply  # write
//
// This does NOT refresh whoop_workouts (no Whoop API call) — it imports over
// whatever is already synced. The /api/whoop/import route does the sync first.

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
const MIN_DURATION_MIN = 20;
const MIN_UNDEFINED_MIN = 30;

const SPORT_TYPE = {
  "paddle-tennis": "padel",
  running: "run",
  walking: "walk",
  "functional-fitness": "other",
  activity: "other",
};
const SPORT_LABEL = { "functional-fitness": "functional fitness" };

const round1 = (n) => (n == null || !Number.isFinite(n) ? null : Number(n.toFixed(1)));
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
const note = (strain, kcal) =>
  `Whoop: strain ${strain == null ? "0.0" : Number(strain).toFixed(1)}, ${kcal == null ? 0 : Math.round(kcal)} kcal`;

// Mirror of lib/whoopActivityImport.ts planWhoopImport.
function planWhoopImport(workouts, sessions, activities) {
  const gymWindows = sessions.map((s) => [s.started_at, s.completed_at]);
  const linkedExtIds = new Set(activities.map((a) => a.external_id).filter(Boolean));
  const overlapsGym = (start, end) => gymWindows.some(([gs, ge]) => start < ge && end > gs);
  const enrichCandidates = activities.filter((a) => a.external_id == null);
  const enrichedIds = new Set();

  const plan = { toAdd: [], toEnrich: [], dropped: [], skippedGym: [] };
  const ordered = [...workouts].sort((a, b) => a.started_at - b.started_at);

  for (const w of ordered) {
    if (linkedExtIds.has(w.whoop_workout_id)) continue;
    const dur = Math.round((w.ended_at - w.started_at) / 60000);
    const sport = w.sport_name ?? "";
    const type = SPORT_TYPE[sport] ?? "other";
    const label = SPORT_LABEL[sport] ?? null;
    const strain = round1(w.strain);

    const floor = type === "other" && label === null ? MIN_UNDEFINED_MIN : MIN_DURATION_MIN;
    if (dur < floor) { plan.dropped.push({ w, dur, type, floor }); continue; }
    if (overlapsGym(w.started_at, w.ended_at)) { plan.skippedGym.push({ w, dur, type }); continue; }

    const wDay = lisbonDay(w.started_at);
    const match = enrichCandidates.find(
      (a) => !enrichedIds.has(a.id) && a.type === type && lisbonDay(a.started_at) === wDay
    );
    if (match) {
      enrichedIds.add(match.id);
      plan.toEnrich.push({
        id: match.id, external_id: w.whoop_workout_id, strain, note: note(w.strain, w.kcal),
        _w: w, _type: type, _match: match,
      });
      continue;
    }

    plan.toAdd.push({
      row: {
        user_id: DIOGO, type, label, started_at: w.started_at, duration_min: dur,
        effort: null, distance_km: null, strain, note: note(w.strain, w.kcal),
        source: "whoop", external_id: w.whoop_workout_id,
      },
      _w: w,
    });
  }
  return plan;
}

async function main() {
  const [{ data: workouts, error: we }, { data: sessions, error: se }, { data: acts, error: ae }] =
    await Promise.all([
      supa.from("whoop_workouts")
        .select("whoop_workout_id, started_at, ended_at, sport_name, strain, kcal")
        .eq("user_id", DIOGO),
      supa.from("strength_sessions").select("started_at, completed_at").eq("user_id", DIOGO),
      supa.from("activities")
        .select("id, type, started_at, duration_min, source, external_id")
        .eq("user_id", DIOGO),
    ]);
  if (we) throw new Error(`whoop_workouts read: ${we.message}`);
  if (se) throw new Error(`strength_sessions read: ${se.message}`);
  if (ae) throw new Error(`activities read: ${ae.message}`);

  const plan = planWhoopImport(workouts ?? [], sessions ?? [], acts ?? []);

  const line = (s) => console.log("  " + s);
  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN (pass --apply to write)"} — ${(workouts ?? []).length} whoop_workouts, ${(sessions ?? []).length} gym sessions, ${(acts ?? []).length} activities\n`);

  console.log(`ADD (${plan.toAdd.length}) as source='whoop', effort=null:`);
  plan.toAdd.forEach((p) =>
    line(`${lisbon(p._w.started_at)}  ${String(p._w.sport_name).padEnd(18)} ${String(p.row.duration_min).padStart(3)}min  strain ${p.row.strain}  ->  ${p.row.type}${p.row.label ? ` (${p.row.label})` : ""}`)
  );

  console.log(`\nENRICH (${plan.toEnrich.length}) existing manual rows (attach strain + uuid, keep his inputs):`);
  plan.toEnrich.forEach((e) =>
    line(`${lisbon(e._w.started_at)}  ${String(e._w.sport_name).padEnd(18)} -> activity ${e.id} (${e._type}), strain ${e.strain}, "${e.note}"`)
  );

  console.log(`\nDROP (${plan.dropped.length}) — under floor:`);
  plan.dropped.forEach((d) =>
    line(`${lisbon(d.w.started_at)}  ${String(d.w.sport_name).padEnd(18)} ${String(d.dur).padStart(3)}min  (< ${d.floor}min floor)`)
  );

  console.log(`\nSKIP GYM (${plan.skippedGym.length}) — overlaps a logged strength session:`);
  plan.skippedGym.forEach((d) =>
    line(`${lisbon(d.w.started_at)}  ${String(d.w.sport_name).padEnd(18)} ${String(d.dur).padStart(3)}min`)
  );

  if (!APPLY) { console.log(`\n(dry run — nothing written)`); return; }

  if (plan.toAdd.length > 0) {
    const { data, error } = await supa.from("activities").insert(plan.toAdd.map((p) => p.row)).select("id");
    if (error) throw new Error(`insert: ${error.message}`);
    console.log(`\nINSERTED ${data.length} activities.`);
  }
  for (const e of plan.toEnrich) {
    const { error } = await supa.from("activities")
      .update({ external_id: e.external_id, strain: e.strain, note: e.note })
      .eq("user_id", DIOGO).eq("id", e.id);
    if (error) throw new Error(`enrich ${e.id}: ${error.message}`);
  }
  if (plan.toEnrich.length > 0) console.log(`ENRICHED ${plan.toEnrich.length} activities.`);
  console.log(`\nDone.`);
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
