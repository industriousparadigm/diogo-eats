// Generalises the one-off scripts/import-whoop-activities.mjs backfill into
// a reusable, testable import: turn synced `whoop_workouts` into Movement-tab
// `activities`, either as new source='whoop' rows or by enriching an existing
// manual row with the Whoop measurement (strain).
//
// The decision logic is PURE (planWhoopImport, fully unit-tested). The I/O
// wrapper (importWhoopActivities) fetches the three tables via getSupabase(),
// runs the planner, then applies inserts + enrich-updates. Idempotent: a
// re-run finds every workout already linked by external_id and does nothing.
//
// Rules (Diogo: "be reasonable, don't register 10 min walks or anything short
// and seemingly buggy"):
//   - DROP   workouts under their duration floor (short / buggy noise):
//            MIN_DURATION_MIN for recognised sports, the higher
//            MIN_UNDEFINED_MIN for Whoop's generic unlabelled "activity".
//   - SKIP   workouts overlapping a logged gym (strength_sessions) window —
//            already counted there, importing double-counts.
//   - ENRICH a same-day, same-type manual row (external_id null) with the
//            workout's strain/note + the Whoop UUID. Keeps his label, effort,
//            duration, started_at — strain is the measurement we're adding,
//            not a re-statement of what he did.
//   - ADD    the rest as source='whoop' rows, effort=null (strain is a
//            measurement, not a felt effort — he curates effort later).

import { getSupabase } from "./db";

// --- floors ---
export const MIN_DURATION_MIN = 20; // default floor for recognised sports
export const MIN_UNDEFINED_MIN = 30; // higher floor for the generic unlabelled "activity"

// Whoop sport_name -> our activity type. Generic "activity" and the
// CrossFit-style "functional-fitness" have no dedicated type → 'other';
// functional-fitness keeps a label so it's recognisable on curation.
const SPORT_TYPE: Record<string, string> = {
  "paddle-tennis": "padel",
  running: "run",
  walking: "walk",
  "functional-fitness": "other",
  activity: "other",
};
const SPORT_LABEL: Record<string, string> = {
  "functional-fitness": "functional fitness",
};

// --- row shapes the planner reasons over (loose, I/O-driven) ---
export type WhoopWorkoutRow = {
  whoop_workout_id: string;
  started_at: number; // ms epoch
  ended_at: number; // ms epoch
  sport_name: string | null;
  strain: number | null;
  kcal: number | null;
};

export type StrengthSessionRow = {
  started_at: number; // ms epoch
  completed_at: number; // ms epoch
};

export type ActivityRow = {
  id: string;
  type: string;
  started_at: number; // ms epoch
  duration_min: number;
  source: string;
  external_id: string | null;
};

// A new activity row to insert (source='whoop').
export type NewActivityRow = {
  user_id: string;
  type: string;
  label: string | null;
  started_at: number;
  duration_min: number;
  effort: null;
  distance_km: null;
  strain: number | null;
  note: string;
  source: "whoop";
  external_id: string;
};

// An enrich instruction: attach the Whoop measurement to an existing manual row.
export type EnrichInstruction = {
  id: string;
  external_id: string;
  strain: number | null;
  note: string;
};

export type WhoopImportPlan = {
  toAdd: NewActivityRow[];
  toEnrich: EnrichInstruction[];
  dropped: WhoopWorkoutRow[];
  skippedGym: WhoopWorkoutRow[];
};

// Round to one decimal, preserving null. Mirrors the existing script's
// Number(Number(strain).toFixed(1)).
function round1(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Number(n.toFixed(1));
}

// Local calendar date (Europe/Lisbon) for a ms-epoch timestamp. Same tz as
// the rest of the app + the original backfill script, so a late-evening
// workout buckets on the day Diogo would call it.
function lisbonDay(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

// The Whoop note we stamp on both added + enriched rows.
function whoopNote(strain: number | null, kcal: number | null): string {
  const s = strain == null ? "0.0" : Number(strain).toFixed(1);
  const k = kcal == null ? 0 : Math.round(kcal);
  return `Whoop: strain ${s}, ${k} kcal`;
}

// PURE planner. No I/O. Decides, per workout, whether to add a new activity,
// enrich an existing manual one, drop it (under floor), or skip it (gym dupe).
//
// `now` is accepted for signature symmetry / future windowing; the current
// rules don't gate on it, so it's unused but kept to match the I/O wrapper.
export function planWhoopImport(
  workouts: WhoopWorkoutRow[],
  sessions: StrengthSessionRow[],
  activities: ActivityRow[],
  _now: number
): WhoopImportPlan {
  const gymWindows = sessions.map((s) => [s.started_at, s.completed_at] as const);
  const linkedExtIds = new Set(
    activities.map((a) => a.external_id).filter((x): x is string => Boolean(x))
  );

  const overlapsGym = (start: number, end: number) =>
    gymWindows.some(([gs, ge]) => start < ge && end > gs);

  // Enrich candidates: manual rows with no external_id, indexed for first-match
  // pick. We consume from this set so one workout enriches at most one row and
  // no row is enriched twice within a single plan.
  const enrichCandidates = activities.filter((a) => a.external_id == null);
  const enrichedIds = new Set<string>();

  const plan: WhoopImportPlan = {
    toAdd: [],
    toEnrich: [],
    dropped: [],
    skippedGym: [],
  };

  // Process oldest-first for stable, deterministic enrich pairing.
  const ordered = [...workouts].sort((a, b) => a.started_at - b.started_at);

  for (const w of ordered) {
    // Already linked anywhere → idempotent skip.
    if (linkedExtIds.has(w.whoop_workout_id)) continue;

    const dur = Math.round((w.ended_at - w.started_at) / 60000);
    const sport = w.sport_name ?? "";
    const type = SPORT_TYPE[sport] ?? "other";
    const label = SPORT_LABEL[sport] ?? null;
    const strain = round1(w.strain);
    const note = whoopNote(w.strain, w.kcal);

    // Duration floor. The generic unlabelled "activity" ('other' + null label)
    // is the noisiest category and must clear the higher 30-min floor.
    const floor = type === "other" && label === null ? MIN_UNDEFINED_MIN : MIN_DURATION_MIN;
    if (dur < floor) {
      plan.dropped.push(w);
      continue;
    }

    // Gym overlap → already counted in a strength_session; skip.
    if (overlapsGym(w.started_at, w.ended_at)) {
      plan.skippedGym.push(w);
      continue;
    }

    // Enrich a same-day, same-type manual row (generalised merge). First
    // unconsumed match wins; never enrich the same row twice in one plan.
    const wDay = lisbonDay(w.started_at);
    const match = enrichCandidates.find(
      (a) => !enrichedIds.has(a.id) && a.type === type && lisbonDay(a.started_at) === wDay
    );
    if (match) {
      enrichedIds.add(match.id);
      plan.toEnrich.push({
        id: match.id,
        external_id: w.whoop_workout_id,
        strain,
        note,
      });
      continue;
    }

    // Else add a fresh source='whoop' row.
    plan.toAdd.push({
      user_id: "", // filled by the I/O wrapper (planner is user-agnostic)
      type,
      label,
      started_at: w.started_at,
      duration_min: dur,
      effort: null,
      distance_km: null,
      strain,
      note,
      source: "whoop",
      external_id: w.whoop_workout_id,
    });
  }

  return plan;
}

export type ImportResult = {
  added: number;
  enriched: number;
  skipped: number;
};

// I/O wrapper. Fetches whoop_workouts + strength_sessions + activities for the
// user, runs the pure planner, inserts the new rows, and applies each enrich
// update. Returns counts. Idempotent (a re-run plans 0 adds / 0 enriches).
export async function importWhoopActivities(
  userId: string,
  now: number = Date.now()
): Promise<ImportResult> {
  const supa = getSupabase();

  const [workoutsRes, sessionsRes, actsRes] = await Promise.all([
    supa
      .from("whoop_workouts")
      .select("whoop_workout_id, started_at, ended_at, sport_name, strain, kcal")
      .eq("user_id", userId),
    supa.from("strength_sessions").select("started_at, completed_at").eq("user_id", userId),
    supa
      .from("activities")
      .select("id, type, started_at, duration_min, source, external_id")
      .eq("user_id", userId),
  ]);

  if (workoutsRes.error) throw new Error(`whoop_workouts read: ${workoutsRes.error.message}`);
  if (sessionsRes.error) throw new Error(`strength_sessions read: ${sessionsRes.error.message}`);
  if (actsRes.error) throw new Error(`activities read: ${actsRes.error.message}`);

  const workouts = (workoutsRes.data ?? []) as WhoopWorkoutRow[];
  const sessions = (sessionsRes.data ?? []) as StrengthSessionRow[];
  const activities = (actsRes.data ?? []) as ActivityRow[];

  const plan = planWhoopImport(workouts, sessions, activities, now);

  if (plan.toAdd.length > 0) {
    const rows = plan.toAdd.map((r) => ({ ...r, user_id: userId }));
    const { error } = await supa.from("activities").insert(rows);
    if (error) throw new Error(`activities insert: ${error.message}`);
  }

  // Apply enrich updates one row at a time (small counts at single-user scale).
  // user_id guard mirrors updateActivity: a second ownership check.
  for (const e of plan.toEnrich) {
    const { error } = await supa
      .from("activities")
      .update({ external_id: e.external_id, strain: e.strain, note: e.note })
      .eq("user_id", userId)
      .eq("id", e.id);
    if (error) throw new Error(`activities enrich ${e.id}: ${error.message}`);
  }

  return {
    added: plan.toAdd.length,
    enriched: plan.toEnrich.length,
    skipped: plan.skippedGym.length + plan.dropped.length,
  };
}
