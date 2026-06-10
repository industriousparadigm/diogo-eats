// Pure derivations for the strength DETAIL screens, computed client-side
// from payloads the app already has (GET /api/strength/sessions list, and
// a single session's sets). No new endpoint, no beat re-implementation —
// these are presentation derivations (grouping, per-exercise history,
// max-weight progression for the sparkline), not the scoreboard rule.

import type {
  MeasurementType,
  SeriesNumbers,
  StrengthSession,
  StrengthSet,
} from "./strengthTypes";

// ---- session detail: group one session's sets by exercise ----

export type ExerciseGroup = {
  exercise_id: string;
  series: SeriesNumbers[]; // in series_index order
};

// The exercises in a session, in the order they were first logged (sets
// arrive in DB `position` order), each with its series sorted by index.
export function groupSetsByExercise(session: StrengthSession): ExerciseGroup[] {
  const order: string[] = [];
  const byId = new Map<string, StrengthSet[]>();
  for (const s of session.sets) {
    if (!byId.has(s.exercise_id)) {
      byId.set(s.exercise_id, []);
      order.push(s.exercise_id);
    }
    byId.get(s.exercise_id)!.push(s);
  }
  return order.map((id) => ({
    exercise_id: id,
    series: byId
      .get(id)!
      .slice()
      .sort((a, b) => a.series_index - b.series_index)
      .map((s) => ({ weight_kg: s.weight_kg, reps: s.reps })),
  }));
}

// ---- exercise detail: per-exercise chronological history ----

export type ExerciseSessionEntry = {
  session_id: string;
  completed_at: number;
  series: SeriesNumbers[];
};

// Every session that contained `exerciseId`, NEWEST FIRST, each with that
// exercise's series in order. `sessions` may be in any order.
export function exerciseHistory(
  sessions: StrengthSession[],
  exerciseId: string
): ExerciseSessionEntry[] {
  return sessions
    .filter((s) => s.sets.some((set) => set.exercise_id === exerciseId))
    .map((s) => ({
      session_id: s.id,
      completed_at: s.completed_at,
      series: s.sets
        .filter((set) => set.exercise_id === exerciseId)
        .sort((a, b) => a.series_index - b.series_index)
        .map((set) => ({ weight_kg: set.weight_kg, reps: set.reps })),
    }))
    .sort((a, b) => b.completed_at - a.completed_at);
}

// ---- progression sparkline ----

export type ProgressionPoint = { completed_at: number; value: number };

// One value per session that contained the exercise, CHRONOLOGICAL
// (oldest first — left-to-right on a chart):
//   weight_reps / carry — top weight that session (kg; per hand for carry)
//   bodyweight_reps     — total reps that session
// The metric matches `bestForExercise`'s reading, so the line and the
// BEST stat agree.
export function progression(
  sessions: StrengthSession[],
  exerciseId: string,
  type: MeasurementType
): ProgressionPoint[] {
  return sessions
    .filter((s) => s.sets.some((set) => set.exercise_id === exerciseId))
    .map((s) => {
      const sets = s.sets.filter((set) => set.exercise_id === exerciseId);
      const value =
        type === "bodyweight_reps"
          ? sets.reduce((sum, set) => sum + set.reps, 0)
          : sets.reduce((m, set) => Math.max(m, set.weight_kg ?? 0), 0);
      return { completed_at: s.completed_at, value };
    })
    .sort((a, b) => a.completed_at - b.completed_at);
}
