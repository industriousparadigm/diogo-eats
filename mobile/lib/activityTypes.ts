// Activity (general MOVEMENT) — shared types.
//
// MIRRORED from the backend's /api/activities contract (frozen there). An
// activity is the non-gym half of "how I moved": padel, a run, a walk, a
// bike ride. Gym sessions stay in strengthTypes.ts — the two are merged for
// display by lib/movementTimeline.ts, never on the server.
//
// All under requireUser (Bearer). The server whitelists the `type` values
// and validates the rest (see lib/movementLog.ts for the client-side mirror
// of those rules). `started_at` is ms epoch; the UI lets the user adjust it
// (the seed's placeholder hour exists precisely so he can correct it).

export type ActivityEffort = "light" | "moderate" | "hard";

// The activity row, exactly as GET/POST/PATCH return it.
export type Activity = {
  id: string;
  type: string; // a whitelisted slug; unknown values still render (default identity)
  label: string | null;
  started_at: number; // ms epoch
  duration_min: number; // 1..1440
  effort: ActivityEffort | null;
  distance_km: number | null;
  // Whoop strain (0-21), null for manual rows that have no measured workout
  // behind them. It's a MEASUREMENT, not the felt `effort` — the Movement
  // rollup leads with it when present. Set by the importer / future feed.
  strain: number | null;
  // Richer detail (15 Jun): the ground a distance activity was done on, the
  // elevation gained, and the source screenshot a Strava-style AI parse read
  // its stats from. All optional. Pace is DERIVED (distance ÷ time), not stored.
  surface: string | null;
  elevation_m: number | null;
  photo_filename: string | null;
  note: string | null;
  source: string; // "manual" | an importer name
  external_id: string | null;
  created_at: number; // ms epoch
  // Garmin-measured post-workout numbers (11 Jul enrichment), read-only —
  // only populated when Garmin measured the workout, null on manual rows.
  rpe: number | null; // Garmin directWorkoutRpe, 0-100 (display as rpe/10)
  feel: number | null; // Garmin directWorkoutFeel, 0-100 (25/50/75/100 → weak/normal/good/strong)
  training_effect: number | null; // Garmin aerobic training effect, 0-5
};

// POST /api/activities body. duration_min is the only required field besides
// type; everything else is optional / nullable-clearable.
export type CreateActivityInput = {
  type: string;
  label?: string | null;
  started_at?: number;
  duration_min: number;
  effort?: ActivityEffort | null;
  distance_km?: number | null;
  surface?: string | null;
  elevation_m?: number | null;
  photo_filename?: string | null;
  note?: string | null;
};

// What POST /api/activities/parse returns under `parsed` — the stats the AI
// read off a Strava-style screenshot. Every field nullable except confidence
// /summary; the form prefills from these and the user confirms. `started_at`
// is already a ms epoch (the server converted the ISO it read), or null.
export type ParsedActivity = {
  type: string;
  distance_km: number | null;
  duration_min: number | null;
  surface: string | null;
  elevation_m: number | null;
  started_at: number | null;
  avg_pace_per_km: string | null;
  confidence: "low" | "medium" | "high";
  summary: string;
};

// PATCH /api/activities/[id] body — any subset; nullables clear by sending
// null explicitly.
export type UpdateActivityInput = Partial<{
  type: string;
  label: string | null;
  started_at: number;
  duration_min: number;
  effort: ActivityEffort | null;
  distance_km: number | null;
  surface: string | null;
  elevation_m: number | null;
  photo_filename: string | null;
  note: string | null;
}>;
