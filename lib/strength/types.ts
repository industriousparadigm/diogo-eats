// Strength scoreboard — shared types.
//
// The engine (engine.ts, highlights.ts) is pure TS over these shapes so
// the web app can adopt the same arithmetic later without reimplementing.
// The mobile app renders engine PAYLOADS (from the API) — it never
// recomputes beats/highlights client-side.

export type MeasurementType = "weight_reps" | "bodyweight_reps" | "carry";

export type Exercise = {
  id: string; // plain slug, e.g. "leg-press"
  name: string;
  description: string;
  measurement_type: MeasurementType;
  image_key: string;
  sort_order: number;
};

// One series of one exercise. weight_kg is null for bodyweight work and
// means kg PER HAND for carries; reps means STEPS for carries.
export type StrengthSet = {
  exercise_id: string;
  series_index: number; // 1-based within the exercise
  weight_kg: number | null;
  reps: number;
};

export type StrengthSession = {
  id: string;
  started_at: number; // ms epoch
  completed_at: number; // ms epoch
  note: string | null;
  sets: StrengthSet[]; // in logged order (DB `position`)
};

// ---- beat detection ----

// Why an exercise counts as beaten vs the most recent previous session
// containing it. `from`/`to` carry the compared quantity:
//   weight          — max weight (kg) went up
//   reps_at_weight  — same max weight, total reps at that weight went up
//   total_reps      — bodyweight: total reps across series went up
//   steps_at_weight — carry: same kg, total steps at that kg went up
export type BeatKind = "weight" | "reps_at_weight" | "total_reps" | "steps_at_weight";

export type Beat = {
  exercise_id: string;
  kind: BeatKind;
  from: number;
  to: number;
  // The weight the reps/steps comparison happened at (reps_at_weight /
  // steps_at_weight only).
  at_weight_kg?: number;
};

// ---- per-exercise summaries for the overview ----

export type SeriesNumbers = { weight_kg: number | null; reps: number };

export type ExerciseLast = {
  session_id: string;
  completed_at: number;
  series: SeriesNumbers[];
};

// Best-ever numbers, shaped by measurement type:
//   weight_reps / carry — heaviest weight ever + best single-series
//     reps/steps at that weight
//   bodyweight_reps     — best single-session total reps
export type ExerciseBest =
  | { kind: "weight"; weight_kg: number; reps: number }
  | { kind: "total_reps"; reps: number };

// Pre-fill payload for the capture flow: what the series rows open with.
export type ExercisePrefill = {
  series: SeriesNumbers[];
  never_done: boolean;
};

export type ExerciseState = {
  exercise_id: string;
  last: ExerciseLast | null;
  best: ExerciseBest | null;
  prefill: ExercisePrefill;
};

// ---- session history (overview list) ----

export type SessionSummary = {
  id: string;
  started_at: number;
  completed_at: number;
  note: string | null;
  exercise_ids: string[]; // in logged order
  beats_count: number;
};

// ---- highlights ----

export type HighlightId = "beats" | "frequency" | "rest_gap" | "streak" | "next_target";

export type Highlight = {
  id: HighlightId;
  line: string; // ready-to-render copy
  priority: number; // lower = shown higher
  // Structured data behind the line, for future surfaces (charts, web).
  beats?: Beat[];
};

// ---- API payloads ----

export type StrengthOverview = {
  exercises: Exercise[];
  states: ExerciseState[]; // same order as `picker_order`
  picker_order: string[]; // exercise ids, "most likely next" first
  sessions: SessionSummary[]; // newest first
};

export type CompleteSessionResult = {
  session: StrengthSession;
  highlights: Highlight[];
};

// Defaults for a never-done exercise: weight empty, reps 10, two series
// (the progression rule speaks in "both sets"; day 1 was 2 series across
// the board).
export const NEVER_DONE_REPS = 10;
export const NEVER_DONE_SERIES_COUNT = 2;
