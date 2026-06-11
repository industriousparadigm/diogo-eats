// In-progress strength session draft — the gym-floor state machine.
//
// Pure functions over a serializable SessionDraft. The draft lives in
// AsyncStorage (see draftStorage.ts) and survives app kill/backgrounding;
// the server only ever sees completed sessions (POST /api/strength/sessions).
//
// Semantics:
//   - Every exercise gets an entry up front, series pre-filled from the
//     overview payload's prefill (last session's numbers, or the
//     never-done defaults).
//   - A series only counts once CONFIRMED. Unconfirmed rows are just
//     suggestions on screen and never reach the server.
//   - loggedOrder records the order exercises were first confirmed in —
//     it becomes the set order in the payload (the engine derives
//     "most likely next" from it next time).

import {
  NEVER_DONE_REPS,
  NEVER_DONE_SERIES_COUNT,
  type Exercise,
  type SessionPayload,
  type StrengthOverview,
  type StrengthSet,
} from "./strengthTypes";

export type DraftSeries = {
  weight_kg: number | null;
  reps: number;
  confirmed: boolean;
};

export type DraftEntry = {
  exercise_id: string;
  series: DraftSeries[];
};

export type SessionDraft = {
  version: 1;
  started_at: number;
  note: string;
  entries: Record<string, DraftEntry>;
  loggedOrder: string[];
  // Cached overview payload: prefill, picker order, names, images.
  // Gym networks are flaky — once a session starts, the draft must
  // never need the server again until completion.
  overview: StrengthOverview;
};

export function createDraft(overview: StrengthOverview, now: number): SessionDraft {
  const entries: Record<string, DraftEntry> = {};
  for (const state of overview.states) {
    entries[state.exercise_id] = {
      exercise_id: state.exercise_id,
      series: state.prefill.series.map((s) => ({
        weight_kg: s.weight_kg,
        reps: s.reps,
        confirmed: false,
      })),
    };
  }
  return {
    version: 1,
    started_at: now,
    note: "",
    entries,
    loggedOrder: [],
    overview,
  };
}

function withEntry(
  draft: SessionDraft,
  exerciseId: string,
  fn: (entry: DraftEntry) => DraftEntry
): SessionDraft {
  const entry = draft.entries[exerciseId];
  if (!entry) return draft;
  return {
    ...draft,
    entries: { ...draft.entries, [exerciseId]: fn(entry) },
  };
}

export function setSeriesWeight(
  draft: SessionDraft,
  exerciseId: string,
  seriesIdx: number,
  weight_kg: number | null
): SessionDraft {
  return withEntry(draft, exerciseId, (entry) => ({
    ...entry,
    series: entry.series.map((s, i) =>
      i === seriesIdx ? { ...s, weight_kg, confirmed: false } : s
    ),
  }));
}

export function setSeriesReps(
  draft: SessionDraft,
  exerciseId: string,
  seriesIdx: number,
  reps: number
): SessionDraft {
  return withEntry(draft, exerciseId, (entry) => ({
    ...entry,
    series: entry.series.map((s, i) =>
      i === seriesIdx ? { ...s, reps, confirmed: false } : s
    ),
  }));
}

// A series is confirmable when its numbers satisfy the server's
// validation: integer reps >= 1, and a positive weight for weighted
// types (bodyweight may stay null).
export function canConfirmSeries(
  draft: SessionDraft,
  exerciseId: string,
  seriesIdx: number
): boolean {
  const series = draft.entries[exerciseId]?.series[seriesIdx];
  if (!series) return false;
  const type = draft.overview.exercises.find((e) => e.id === exerciseId)
    ?.measurement_type;
  if (!type) return false;
  if (!Number.isInteger(series.reps) || series.reps < 1 || series.reps > 1000) {
    return false;
  }
  if (type === "bodyweight_reps") {
    return series.weight_kg === null || series.weight_kg > 0;
  }
  return series.weight_kg !== null && series.weight_kg > 0 && series.weight_kg <= 500;
}

export function confirmSeries(
  draft: SessionDraft,
  exerciseId: string,
  seriesIdx: number
): SessionDraft {
  if (!canConfirmSeries(draft, exerciseId, seriesIdx)) return draft;
  const next = withEntry(draft, exerciseId, (entry) => ({
    ...entry,
    series: entry.series.map((s, i) => (i === seriesIdx ? { ...s, confirmed: true } : s)),
  }));
  if (!next.loggedOrder.includes(exerciseId)) {
    return { ...next, loggedOrder: [...next.loggedOrder, exerciseId] };
  }
  return next;
}

export function unconfirmSeries(
  draft: SessionDraft,
  exerciseId: string,
  seriesIdx: number
): SessionDraft {
  return withEntry(draft, exerciseId, (entry) => ({
    ...entry,
    series: entry.series.map((s, i) => (i === seriesIdx ? { ...s, confirmed: false } : s)),
  }));
}

// Add one more series, pre-filled from the previous row's numbers.
export function addSeries(draft: SessionDraft, exerciseId: string): SessionDraft {
  return withEntry(draft, exerciseId, (entry) => {
    const lastRow = entry.series[entry.series.length - 1];
    const blank: DraftSeries = lastRow
      ? { weight_kg: lastRow.weight_kg, reps: lastRow.reps, confirmed: false }
      : { weight_kg: null, reps: 10, confirmed: false };
    return { ...entry, series: [...entry.series, blank] };
  });
}

export function setNote(draft: SessionDraft, note: string): SessionDraft {
  return { ...draft, note };
}

// Inject an exercise into the live draft after creation — for the picker's
// "+ new exercise" flow and the alternatives sheet's "or add:" path, where
// a freshly-created (or just-discovered-existing) exercise must be loggable
// immediately without re-fetching the overview (gym networks are flaky;
// the draft is the source of truth until completion).
//
// A never-done exercise opens with the standard defaults: NEVER_DONE_SERIES
// rows at NEVER_DONE_REPS, weight blank (null) — the same shape the server's
// prefill builds for a never-logged catalog entry. It slots to the FRONT of
// picker_order because the user just reached for it (it's the most-likely
// next thing they'll log). Idempotent: if the exercise is already in the
// draft (the 409 "use that one" can echo a catalog exercise the draft
// already holds), the draft is returned unchanged so its entry — possibly
// mid-edit — is preserved.
export function addExerciseToDraft(
  draft: SessionDraft,
  exercise: Exercise
): SessionDraft {
  if (draft.overview.exercises.some((e) => e.id === exercise.id)) {
    return draft;
  }
  const series = Array.from({ length: NEVER_DONE_SERIES_COUNT }, () => ({
    weight_kg: null,
    reps: NEVER_DONE_REPS,
  }));
  return {
    ...draft,
    overview: {
      ...draft.overview,
      exercises: [...draft.overview.exercises, exercise],
      states: [
        ...draft.overview.states,
        {
          exercise_id: exercise.id,
          last: null,
          best: null,
          prefill: { series, never_done: true },
        },
      ],
      picker_order: [exercise.id, ...draft.overview.picker_order],
    },
    entries: {
      ...draft.entries,
      [exercise.id]: {
        exercise_id: exercise.id,
        series: series.map((s) => ({ ...s, confirmed: false })),
      },
    },
  };
}

export function confirmedCount(draft: SessionDraft, exerciseId?: string): number {
  const entries = exerciseId
    ? [draft.entries[exerciseId]].filter((e): e is DraftEntry => !!e)
    : Object.values(draft.entries);
  return entries.reduce(
    (sum, e) => sum + e.series.filter((s) => s.confirmed).length,
    0
  );
}

export function exerciseDone(draft: SessionDraft, exerciseId: string): boolean {
  return confirmedCount(draft, exerciseId) > 0;
}

// Picker order for the live session: the overview's "most likely next"
// order, with done-today exercises sunk to the bottom (keeping their
// relative order so the list stays stable as cards sink).
export function liveCardOrder(draft: SessionDraft): string[] {
  const order = draft.overview.picker_order;
  const pending = order.filter((id) => !exerciseDone(draft, id));
  const done = order.filter((id) => exerciseDone(draft, id));
  return [...pending, ...done];
}

// Assemble the POST body. Confirmed series only, renumbered 1..n per
// exercise (confirming series 1 and 3 yields indexes 1 and 2 — the
// server requires unique, contiguous-enough indexes and "fewer series
// than last time" is a legitimate session). Exercises appear in the
// order they were first confirmed.
export function toSessionPayload(
  draft: SessionDraft,
  completedAt: number
): SessionPayload {
  const sets: StrengthSet[] = [];
  for (const exerciseId of draft.loggedOrder) {
    const entry = draft.entries[exerciseId];
    if (!entry) continue;
    const confirmed = entry.series.filter((s) => s.confirmed);
    confirmed.forEach((s, i) => {
      sets.push({
        exercise_id: exerciseId,
        series_index: i + 1,
        weight_kg: s.weight_kg,
        reps: s.reps,
      });
    });
  }
  const note = draft.note.trim();
  return {
    started_at: draft.started_at,
    completed_at: completedAt,
    note: note.length > 0 ? note : null,
    sets,
  };
}

// Serialization round-trip for AsyncStorage. Returns null for anything
// that doesn't look like a current-version draft (corrupt JSON, old
// schema) so callers can just discard.
export function serializeDraft(draft: SessionDraft): string {
  return JSON.stringify(draft);
}

export function deserializeDraft(raw: string): SessionDraft | null {
  try {
    const parsed = JSON.parse(raw) as SessionDraft;
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.started_at !== "number" ||
      typeof parsed.note !== "string" ||
      !parsed.entries ||
      !Array.isArray(parsed.loggedOrder) ||
      !parsed.overview ||
      !Array.isArray(parsed.overview.exercises)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
