// Unit tests for lib/strengthSession.ts — the gym-floor draft state
// machine: prefill, confirm/nudge, add-series, picker ordering, payload
// assembly, and the serialization round-trip that backs AsyncStorage
// persistence (spec 6.2.5: backgrounding must never lose a set).

import {
  addExerciseToDraft,
  addSeries,
  canConfirmSeries,
  confirmSeries,
  confirmedCount,
  createDraft,
  deserializeDraft,
  exerciseDone,
  liveCardOrder,
  serializeDraft,
  setNote,
  setSeriesReps,
  setSeriesWeight,
  toSessionPayload,
  unconfirmSeries,
} from "../lib/strengthSession";
import { mockStrengthOverview } from "../lib/strengthFixtures";
import type { Exercise } from "../lib/strengthTypes";

const NEW_EXERCISE: Exercise = {
  id: "tricep-pulley",
  name: "Tricep pulley",
  description: "Elbows pinned, push down, control the way up.",
  measurement_type: "weight_reps",
  image_key: "tricep-pulley",
  created_by: "u1",
  sort_order: 99,
};

const NOW = new Date("2026-06-12T18:00:00").getTime();

function fresh() {
  return createDraft(mockStrengthOverview(), NOW);
}

describe("createDraft", () => {
  it("pre-fills every exercise from the overview prefill", () => {
    const draft = fresh();
    expect(draft.entries["leg-press"].series).toEqual([
      { weight_kg: 32, reps: 12, confirmed: false },
      { weight_kg: 39, reps: 12, confirmed: false },
    ]);
    expect(draft.entries["back-extension"].series).toEqual([
      { weight_kg: null, reps: 12, confirmed: false },
      { weight_kg: null, reps: 12, confirmed: false },
    ]);
  });

  it("starts with no logged exercises and an empty note", () => {
    const draft = fresh();
    expect(draft.loggedOrder).toEqual([]);
    expect(draft.note).toBe("");
    expect(confirmedCount(draft)).toBe(0);
    expect(draft.started_at).toBe(NOW);
  });
});

describe("confirm / nudge", () => {
  it("confirming a pre-filled series counts it", () => {
    const draft = confirmSeries(fresh(), "leg-press", 0);
    expect(confirmedCount(draft, "leg-press")).toBe(1);
    expect(exerciseDone(draft, "leg-press")).toBe(true);
  });

  it("first confirm records the exercise in loggedOrder", () => {
    let draft = fresh();
    draft = confirmSeries(draft, "chest-press", 0);
    draft = confirmSeries(draft, "leg-press", 0);
    draft = confirmSeries(draft, "chest-press", 1);
    expect(draft.loggedOrder).toEqual(["chest-press", "leg-press"]);
  });

  it("editing a value un-confirms the series", () => {
    let draft = confirmSeries(fresh(), "leg-press", 0);
    draft = setSeriesWeight(draft, "leg-press", 0, 34);
    expect(confirmedCount(draft, "leg-press")).toBe(0);
    expect(draft.entries["leg-press"].series[0].weight_kg).toBe(34);
  });

  it("unconfirmSeries reverses a confirm", () => {
    let draft = confirmSeries(fresh(), "leg-press", 0);
    draft = unconfirmSeries(draft, "leg-press", 0);
    expect(confirmedCount(draft)).toBe(0);
  });

  it("weight change mid-session is per-series (32 then 39)", () => {
    let draft = fresh();
    draft = confirmSeries(draft, "leg-press", 0); // 32kg x 12
    draft = setSeriesWeight(draft, "leg-press", 1, 41);
    draft = confirmSeries(draft, "leg-press", 1); // 41kg x 12
    const payload = toSessionPayload(draft, NOW + 1000);
    expect(payload.sets).toEqual([
      { exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 12 },
      { exercise_id: "leg-press", series_index: 2, weight_kg: 41, reps: 12 },
    ]);
  });
});

describe("canConfirmSeries", () => {
  it("requires a positive weight for weighted exercises", () => {
    let draft = setSeriesWeight(fresh(), "leg-press", 0, null);
    expect(canConfirmSeries(draft, "leg-press", 0)).toBe(false);
    draft = setSeriesWeight(draft, "leg-press", 0, 32);
    expect(canConfirmSeries(draft, "leg-press", 0)).toBe(true);
  });

  it("allows null weight for bodyweight exercises", () => {
    expect(canConfirmSeries(fresh(), "back-extension", 0)).toBe(true);
  });

  it("requires integer reps >= 1", () => {
    let draft = setSeriesReps(fresh(), "leg-press", 0, 0);
    expect(canConfirmSeries(draft, "leg-press", 0)).toBe(false);
    draft = setSeriesReps(draft, "leg-press", 0, 12);
    expect(canConfirmSeries(draft, "leg-press", 0)).toBe(true);
  });

  it("confirm is a no-op when the series isn't confirmable", () => {
    let draft = setSeriesWeight(fresh(), "leg-press", 0, null);
    draft = confirmSeries(draft, "leg-press", 0);
    expect(confirmedCount(draft)).toBe(0);
    expect(draft.loggedOrder).toEqual([]);
  });
});

describe("addSeries", () => {
  it("copies the previous row's numbers", () => {
    const draft = addSeries(fresh(), "leg-press");
    const series = draft.entries["leg-press"].series;
    expect(series).toHaveLength(3);
    expect(series[2]).toEqual({ weight_kg: 39, reps: 12, confirmed: false });
  });
});

describe("liveCardOrder", () => {
  it("starts as the overview picker order", () => {
    expect(liveCardOrder(fresh())).toEqual([
      "leg-press",
      "back-extension",
      "chest-press",
      "seated-row",
      "farmers-carry",
    ]);
  });

  it("sinks done exercises to the bottom, keeping relative order", () => {
    let draft = confirmSeries(fresh(), "leg-press", 0);
    expect(liveCardOrder(draft)).toEqual([
      "back-extension",
      "chest-press",
      "seated-row",
      "farmers-carry",
      "leg-press",
    ]);
    draft = confirmSeries(draft, "chest-press", 0);
    expect(liveCardOrder(draft)).toEqual([
      "back-extension",
      "seated-row",
      "farmers-carry",
      "leg-press",
      "chest-press",
    ]);
  });
});

describe("toSessionPayload", () => {
  it("includes only confirmed series", () => {
    let draft = confirmSeries(fresh(), "seated-row", 1); // confirm series 2 only
    const payload = toSessionPayload(draft, NOW + 1000);
    expect(payload.sets).toEqual([
      { exercise_id: "seated-row", series_index: 1, weight_kg: 32, reps: 12 },
    ]);
  });

  it("renumbers confirmed series contiguously (fewer series than last time)", () => {
    let draft = fresh();
    draft = addSeries(draft, "leg-press"); // 3 rows now
    draft = confirmSeries(draft, "leg-press", 0);
    draft = confirmSeries(draft, "leg-press", 2); // skip the middle row
    const payload = toSessionPayload(draft, NOW + 1000);
    expect(payload.sets.map((s) => s.series_index)).toEqual([1, 2]);
  });

  it("orders sets by first-confirmed exercise order", () => {
    let draft = fresh();
    draft = confirmSeries(draft, "farmers-carry", 0);
    draft = confirmSeries(draft, "leg-press", 0);
    const payload = toSessionPayload(draft, NOW + 1000);
    expect(payload.sets.map((s) => s.exercise_id)).toEqual([
      "farmers-carry",
      "leg-press",
    ]);
  });

  it("trims the note and nulls it when empty", () => {
    let draft = setNote(fresh(), "  ");
    expect(toSessionPayload(draft, NOW).note).toBeNull();
    draft = setNote(draft, " easy day ");
    expect(toSessionPayload(draft, NOW).note).toBe("easy day");
  });

  it("carries started/completed timestamps", () => {
    const payload = toSessionPayload(fresh(), NOW + 60_000);
    expect(payload.started_at).toBe(NOW);
    expect(payload.completed_at).toBe(NOW + 60_000);
  });
});

describe("serialization round-trip", () => {
  it("survives serialize -> deserialize intact (app kill mid-session)", () => {
    let draft = fresh();
    draft = setSeriesWeight(draft, "leg-press", 1, 41);
    draft = confirmSeries(draft, "leg-press", 0);
    draft = confirmSeries(draft, "leg-press", 1);
    draft = setNote(draft, "felt strong");
    const restored = deserializeDraft(serializeDraft(draft));
    expect(restored).toEqual(draft);
    // And the restored draft still produces the same payload.
    expect(toSessionPayload(restored!, NOW + 1000)).toEqual(
      toSessionPayload(draft, NOW + 1000)
    );
  });

  it("rejects corrupt JSON", () => {
    expect(deserializeDraft("{nope")).toBeNull();
    expect(deserializeDraft("")).toBeNull();
  });

  it("rejects wrong-version or malformed drafts", () => {
    expect(deserializeDraft(JSON.stringify({ version: 2 }))).toBeNull();
    expect(deserializeDraft(JSON.stringify({ version: 1 }))).toBeNull();
    expect(deserializeDraft(JSON.stringify(null))).toBeNull();
  });
});

describe("addExerciseToDraft", () => {
  it("injects a new exercise with the never-done defaults (2 series, 10 reps, no weight)", () => {
    const draft = addExerciseToDraft(fresh(), NEW_EXERCISE);
    // Catalog + state + picker_order + entry all gain it.
    expect(draft.overview.exercises.some((e) => e.id === "tricep-pulley")).toBe(true);
    const state = draft.overview.states.find((s) => s.exercise_id === "tricep-pulley");
    expect(state?.prefill.never_done).toBe(true);
    expect(state?.prefill.series).toEqual([
      { weight_kg: null, reps: 10 },
      { weight_kg: null, reps: 10 },
    ]);
    expect(state?.last).toBeNull();
    expect(state?.best).toBeNull();
    const entry = draft.entries["tricep-pulley"];
    expect(entry?.series).toEqual([
      { weight_kg: null, reps: 10, confirmed: false },
      { weight_kg: null, reps: 10, confirmed: false },
    ]);
  });

  it("puts the new exercise at the front of picker_order (most likely next)", () => {
    const draft = addExerciseToDraft(fresh(), NEW_EXERCISE);
    expect(draft.overview.picker_order[0]).toBe("tricep-pulley");
  });

  it("is idempotent: re-adding an exercise already in the draft is a no-op", () => {
    const once = addExerciseToDraft(fresh(), NEW_EXERCISE);
    // Pretend the user started editing its entry, then a 'use that one'
    // re-injected the same exercise — the in-progress entry must survive.
    const edited = setSeriesWeight(once, "tricep-pulley", 0, 27);
    const twice = addExerciseToDraft(edited, NEW_EXERCISE);
    expect(twice).toBe(edited); // unchanged reference — entry preserved
    expect(twice.entries["tricep-pulley"].series[0].weight_kg).toBe(27);
    // No duplicate catalog row.
    const count = twice.overview.exercises.filter((e) => e.id === "tricep-pulley").length;
    expect(count).toBe(1);
  });

  it("does not duplicate an existing seeded exercise", () => {
    const seeded = mockStrengthOverview().exercises[0]; // leg-press
    const draft = addExerciseToDraft(fresh(), seeded);
    const count = draft.overview.exercises.filter((e) => e.id === seeded.id).length;
    expect(count).toBe(1);
  });
});
