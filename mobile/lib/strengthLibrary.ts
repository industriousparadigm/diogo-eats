// Strength library — pure derivations for the full-catalog browse screen
// (app/(app)/strength/exercises). The landing no longer carries the catalog;
// the library is where browsing lives, and it has to scale toward 1000
// exercises. These helpers stay pure so the search field is declarative and
// unit-testable.
//
// Two things the library needs that the picker-zone helpers don't quite give:
//   1. a search over the WHOLE catalog (not just an "everything-else" subset)
//   2. the per-exercise LAST / BEST pairing for the compact card subline,
//      joined from the overview's `states` so each row reads as a scoreboard
//      entry, not a bare name.

import type { Exercise, ExerciseState } from "./strengthTypes";

// Case-insensitive substring filter over a catalog by display name. Empty /
// blank query returns the catalog unchanged. A simple contains-match — fine
// at 1000 rows (one lowercase + includes per row, per keystroke) and the
// behaviour a gym user expects ("press" finds "Leg press", "Chest press").
export function searchExercises(exercises: Exercise[], query: string): Exercise[] {
  const q = query.trim().toLowerCase();
  if (!q) return exercises;
  return exercises.filter((e) => e.name.toLowerCase().includes(q));
}

// Pair each exercise with its scoreboard state (LAST / BEST) for the row
// subline. Missing state (a never-done exercise) yields a null state, which
// the row renders as "not done yet". Catalog order is preserved.
export type LibraryRow = {
  exercise: Exercise;
  state: ExerciseState | null;
};

export function libraryRows(
  exercises: Exercise[],
  states: ExerciseState[]
): LibraryRow[] {
  const stateById = new Map(states.map((s) => [s.exercise_id, s]));
  return exercises.map((exercise) => ({
    exercise,
    state: stateById.get(exercise.id) ?? null,
  }));
}
