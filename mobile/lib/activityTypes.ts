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
  note: string | null;
  source: string; // "manual" | an importer name
  external_id: string | null;
  created_at: number; // ms epoch
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
  note?: string | null;
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
  note: string | null;
}>;
