// Picker zone derivation — splits the live-session picker into the two
// named zones the overhaul introduces (DESIGN.md "picker zones"):
//
//   YOUR USUAL    — exercises the user actually trains: anything that
//                   appears in their session history, in the overview's
//                   "most likely next" order (picker_order). This is the
//                   pre-overhaul picker, now named.
//   EVERYTHING ELSE — the rest of the catalog (seeded movements never
//                   logged, plus any user-created exercise that hasn't been
//                   trained yet). Searchable; the screen only renders this
//                   zone when it's non-empty.
//
// Both zones respect the live-session rule that a done-TODAY exercise sinks
// to the bottom of its own zone (keeping relative order), so a card the
// user just logged drops out of the way without leaving the zone it
// belongs to.
//
// Pure over the draft so it's unit-testable and never recomputes engine
// state client-side — it only re-buckets the order the server already sent.

import { exerciseDone, type SessionDraft } from "./strengthSession";

export type PickerZones = {
  usual: string[]; // exercise ids — "your usual", most-likely-next order
  everythingElse: string[]; // exercise ids — the rest of the catalog
};

// The set of exercise ids the user has logged in any past session (from the
// overview's session summaries). These are "your usual". An exercise the
// user created but hasn't trained yet is NOT usual until it's been logged.
export function usualExerciseIds(draft: SessionDraft): Set<string> {
  const ids = new Set<string>();
  for (const session of draft.overview.sessions) {
    for (const id of session.exercise_ids) ids.add(id);
  }
  return ids;
}

// Sink done-today ids to the bottom while preserving each group's relative
// order — the same stabilising move liveCardOrder makes, applied per zone.
function sinkDone(draft: SessionDraft, ids: string[]): string[] {
  const pending = ids.filter((id) => !exerciseDone(draft, id));
  const done = ids.filter((id) => exerciseDone(draft, id));
  return [...pending, ...done];
}

export function pickerZones(draft: SessionDraft): PickerZones {
  const usualSet = usualExerciseIds(draft);
  // Catalog ids that actually exist (guard against a stale picker_order
  // referencing an id the catalog no longer carries).
  const catalogIds = new Set(draft.overview.exercises.map((e) => e.id));

  // picker_order is "most likely next" — the canonical ordering for the
  // usual zone. Anything in the catalog but not in picker_order falls to
  // everything-else, appended in catalog (sort_order) order.
  const order = draft.overview.picker_order.filter((id) => catalogIds.has(id));
  const orderedSet = new Set(order);
  const trailing = draft.overview.exercises
    .map((e) => e.id)
    .filter((id) => !orderedSet.has(id));
  const allOrdered = [...order, ...trailing];

  const usual = allOrdered.filter((id) => usualSet.has(id));
  const everythingElse = allOrdered.filter((id) => !usualSet.has(id));

  return {
    usual: sinkDone(draft, usual),
    everythingElse: sinkDone(draft, everythingElse),
  };
}

// Case-insensitive substring filter over the everything-else zone, matching
// on the exercise's display name. Empty/blank query returns the zone
// unchanged. Pure helper so the search field stays declarative.
export function filterByName(
  draft: SessionDraft,
  ids: string[],
  query: string
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return ids;
  const byId = new Map(draft.overview.exercises.map((e) => [e.id, e]));
  return ids.filter((id) => {
    const name = byId.get(id)?.name ?? id;
    return name.toLowerCase().includes(q);
  });
}
