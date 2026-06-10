// Strength engine — beat detection, pre-fill resolution, picker
// ordering, overview assembly. Pure functions over StrengthSession[];
// no I/O, no Date.now(), no timezone access. Heavily unit-tested —
// this arithmetic is the product.

import {
  Beat,
  Exercise,
  ExerciseBest,
  ExerciseLast,
  ExercisePrefill,
  ExerciseState,
  MeasurementType,
  NEVER_DONE_REPS,
  NEVER_DONE_SERIES_COUNT,
  SessionSummary,
  StrengthOverview,
  StrengthSession,
  StrengthSet,
} from "./types";

// Chronological ascending, stable. Tie-breaks keep ordering deterministic
// when two sessions share a completed_at (shouldn't happen, but cheap).
export function sortSessions(history: StrengthSession[]): StrengthSession[] {
  return [...history].sort(
    (a, b) =>
      a.completed_at - b.completed_at ||
      a.started_at - b.started_at ||
      a.id.localeCompare(b.id)
  );
}

// A session's sets for one exercise, in series order.
export function setsForExercise(
  session: StrengthSession,
  exerciseId: string
): StrengthSet[] {
  return session.sets
    .filter((s) => s.exercise_id === exerciseId)
    .sort((a, b) => a.series_index - b.series_index);
}

// Exercise ids in the order they were first logged (sets arrive in
// logged order — DB `position`).
export function exercisesInLoggedOrder(session: StrengthSession): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of session.sets) {
    if (!seen.has(s.exercise_id)) {
      seen.add(s.exercise_id);
      out.push(s.exercise_id);
    }
  }
  return out;
}

// ---- beat detection ----

function maxWeight(sets: StrengthSet[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weight_kg ?? 0), 0);
}

function totalRepsAtWeight(sets: StrengthSet[], weight: number): number {
  return sets
    .filter((s) => (s.weight_kg ?? 0) === weight)
    .reduce((sum, s) => sum + s.reps, 0);
}

function totalReps(sets: StrengthSet[]): number {
  return sets.reduce((sum, s) => sum + s.reps, 0);
}

// Beat per the spec, vs the most recent previous session containing the
// exercise:
//   weight_reps      — max weight up; OR same max weight and total reps
//                      at that weight up
//   bodyweight_reps  — total reps up
//   carry            — kg up; OR same kg and total steps at that kg up
//
// "Total reps at the max weight" (not per-series max) is the deliberate
// reading of "reps at that weight increased": doing MORE series at the
// top weight is a beat; doing FEWER series than last time is not.
export function computeExerciseBeat(
  type: MeasurementType,
  exerciseId: string,
  todaySets: StrengthSet[],
  prevSets: StrengthSet[]
): Beat | null {
  if (todaySets.length === 0 || prevSets.length === 0) return null;

  if (type === "bodyweight_reps") {
    const from = totalReps(prevSets);
    const to = totalReps(todaySets);
    return to > from
      ? { exercise_id: exerciseId, kind: "total_reps", from, to }
      : null;
  }

  // weight_reps and carry share the shape; only the beat-kind label for
  // the reps-at-weight branch differs (reps vs steps).
  const fromW = maxWeight(prevSets);
  const toW = maxWeight(todaySets);
  if (toW > fromW) {
    return { exercise_id: exerciseId, kind: "weight", from: fromW, to: toW };
  }
  if (toW === fromW) {
    const from = totalRepsAtWeight(prevSets, fromW);
    const to = totalRepsAtWeight(todaySets, toW);
    if (to > from) {
      return {
        exercise_id: exerciseId,
        kind: type === "carry" ? "steps_at_weight" : "reps_at_weight",
        from,
        to,
        at_weight_kg: toW,
      };
    }
  }
  return null;
}

// Most recent prior session (strictly before, chronologically) that
// contains the exercise. `prior` may be unsorted.
export function previousSessionWithExercise(
  prior: StrengthSession[],
  exerciseId: string
): StrengthSession | null {
  const sorted = sortSessions(prior);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].sets.some((s) => s.exercise_id === exerciseId)) {
      return sorted[i];
    }
  }
  return null;
}

// All beats in `session`, one per exercise max, in the session's logged
// order. `prior` = every session completed before it. First-ever
// occurrences of an exercise can't beat anything and yield nothing.
export function computeSessionBeats(
  exercises: Exercise[],
  prior: StrengthSession[],
  session: StrengthSession
): Beat[] {
  const typeById = new Map(exercises.map((e) => [e.id, e.measurement_type]));
  const beats: Beat[] = [];
  for (const exId of exercisesInLoggedOrder(session)) {
    const type = typeById.get(exId);
    if (!type) continue; // unknown exercise — ignore, don't throw
    const prev = previousSessionWithExercise(prior, exId);
    if (!prev) continue;
    const beat = computeExerciseBeat(
      type,
      exId,
      setsForExercise(session, exId),
      setsForExercise(prev, exId)
    );
    if (beat) beats.push(beat);
  }
  return beats;
}

// The beats achieved IN a given session, computed against everything that
// came strictly before it chronologically — the per-session-detail view.
// `target` must be one of `history` (matched by id). Reuses
// computeSessionBeats; never reimplements the beat rule. Unknown id (not
// in history) yields []. The session is excluded from its own "prior" so
// it can't beat itself, and any sessions completed AFTER it are excluded
// too (they aren't "previous").
export function beatsForSession(
  exercises: Exercise[],
  history: StrengthSession[],
  sessionId: string
): Beat[] {
  const sorted = sortSessions(history);
  const idx = sorted.findIndex((s) => s.id === sessionId);
  if (idx === -1) return [];
  return computeSessionBeats(exercises, sorted.slice(0, idx), sorted[idx]);
}

// ---- per-exercise summaries ----

export function lastForExercise(
  history: StrengthSession[],
  exerciseId: string
): ExerciseLast | null {
  const last = previousSessionWithExercise(history, exerciseId);
  if (!last) return null;
  return {
    session_id: last.id,
    completed_at: last.completed_at,
    series: setsForExercise(last, exerciseId).map((s) => ({
      weight_kg: s.weight_kg,
      reps: s.reps,
    })),
  };
}

export function bestForExercise(
  history: StrengthSession[],
  exercise: Exercise
): ExerciseBest | null {
  const allSets: StrengthSet[] = [];
  for (const session of history) {
    allSets.push(...setsForExercise(session, exercise.id));
  }
  if (allSets.length === 0) return null;

  if (exercise.measurement_type === "bodyweight_reps") {
    // Best single-session total.
    let best = 0;
    for (const session of history) {
      best = Math.max(best, totalReps(setsForExercise(session, exercise.id)));
    }
    return { kind: "total_reps", reps: best };
  }

  // Heaviest ever + best single-series reps/steps at that weight.
  const w = maxWeight(allSets);
  const reps = allSets
    .filter((s) => (s.weight_kg ?? 0) === w)
    .reduce((m, s) => Math.max(m, s.reps), 0);
  return { kind: "weight", weight_kg: w, reps };
}

// Pre-fill: last session's numbers for the exercise, series-for-series.
// Never done: weight empty, reps default 10, two series.
export function prefillForExercise(
  history: StrengthSession[],
  exerciseId: string
): ExercisePrefill {
  const last = lastForExercise(history, exerciseId);
  if (last && last.series.length > 0) {
    return { series: last.series, never_done: false };
  }
  return {
    series: Array.from({ length: NEVER_DONE_SERIES_COUNT }, () => ({
      weight_kg: null,
      reps: NEVER_DONE_REPS,
    })),
    never_done: true,
  };
}

// Picker order, "most likely next" first: the last session's exercises
// in the order they were logged there, then everything else by
// sort_order. ("Minus already-logged-today" is applied client-side
// during a live session — done cards sink, the base order is this.)
export function pickerOrder(
  exercises: Exercise[],
  history: StrengthSession[]
): string[] {
  const sorted = sortSessions(history);
  const last = sorted[sorted.length - 1] ?? null;
  const catalogIds = new Set(exercises.map((e) => e.id));
  const fromLast = last
    ? exercisesInLoggedOrder(last).filter((id) => catalogIds.has(id))
    : [];
  const inLast = new Set(fromLast);
  const rest = [...exercises]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((e) => e.id)
    .filter((id) => !inLast.has(id));
  return [...fromLast, ...rest];
}

// ---- overview assembly ----

export function buildOverview(
  exercises: Exercise[],
  history: StrengthSession[]
): StrengthOverview {
  const sorted = sortSessions(history);
  const order = pickerOrder(exercises, sorted);
  const byId = new Map(exercises.map((e) => [e.id, e]));

  const states: ExerciseState[] = order
    .map((id) => byId.get(id))
    .filter((e): e is Exercise => !!e)
    .map((e) => ({
      exercise_id: e.id,
      last: lastForExercise(sorted, e.id),
      best: bestForExercise(sorted, e),
      prefill: prefillForExercise(sorted, e.id),
    }));

  // Newest first; each session's beats are computed against everything
  // strictly before it.
  const sessions: SessionSummary[] = sorted
    .map((s, i) => ({
      id: s.id,
      started_at: s.started_at,
      completed_at: s.completed_at,
      note: s.note,
      exercise_ids: exercisesInLoggedOrder(s),
      beats_count: computeSessionBeats(exercises, sorted.slice(0, i), s).length,
    }))
    .reverse();

  return { exercises, states, picker_order: order, sessions };
}
