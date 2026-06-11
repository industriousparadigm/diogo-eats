// Zone-split derivation — the pure helper that buckets the live picker into
// YOUR USUAL (logged-before exercises, most-likely-next order) and
// EVERYTHING ELSE (the rest of the catalog), and the everything-else search
// filter. No engine recompute — it only re-buckets the server's order.

import { pickerZones, usualExerciseIds, filterByName } from "../lib/pickerZones";
import { createDraft, confirmSeries } from "../lib/strengthSession";
import { mockStrengthOverview } from "../lib/strengthFixtures";
import type { Exercise, StrengthOverview } from "../lib/strengthTypes";

// Build a draft from an overview where only SOME exercises have history, so
// the two zones actually differ (the day-1 fixture has all five logged).
function partialOverview(): StrengthOverview {
  const base = mockStrengthOverview();
  // Pretend the only prior session logged leg-press + chest-press; the rest
  // of the catalog has never been trained.
  return {
    ...base,
    sessions: [
      {
        id: "s1",
        started_at: 1,
        completed_at: 2,
        note: null,
        exercise_ids: ["leg-press", "chest-press"],
        beats_count: 0,
      },
    ],
  };
}

describe("pickerZones", () => {
  it("usualExerciseIds collects every exercise from session history", () => {
    const draft = createDraft(partialOverview(), Date.now());
    const usual = usualExerciseIds(draft);
    expect(usual.has("leg-press")).toBe(true);
    expect(usual.has("chest-press")).toBe(true);
    expect(usual.has("seated-row")).toBe(false);
  });

  it("splits the catalog into usual (logged) and everything-else (the rest)", () => {
    const draft = createDraft(partialOverview(), Date.now());
    const { usual, everythingElse } = pickerZones(draft);
    expect(usual).toEqual(["leg-press", "chest-press"]);
    // The other three, in picker_order, land in everything-else.
    expect(everythingElse).toEqual(["back-extension", "seated-row", "farmers-carry"]);
  });

  it("keeps the usual zone in the overview's most-likely-next order", () => {
    const base = partialOverview();
    // Flip picker_order so chest-press is "more likely next" than leg-press.
    const draft = createDraft(
      { ...base, picker_order: ["chest-press", "leg-press", "back-extension", "seated-row", "farmers-carry"] },
      Date.now()
    );
    expect(pickerZones(draft).usual).toEqual(["chest-press", "leg-press"]);
  });

  it("sinks a done-today exercise to the bottom of its own zone", () => {
    let draft = createDraft(partialOverview(), Date.now());
    // Log leg-press this session → it's done, sinks below chest-press but
    // STAYS in the usual zone (it's still a usual exercise).
    draft = confirmSeries(draft, "leg-press", 0);
    const { usual, everythingElse } = pickerZones(draft);
    expect(usual).toEqual(["chest-press", "leg-press"]);
    expect(everythingElse).toEqual(["back-extension", "seated-row", "farmers-carry"]);
  });

  it("when nothing has been logged, everything is in everything-else", () => {
    const base = mockStrengthOverview();
    const draft = createDraft({ ...base, sessions: [] }, Date.now());
    const { usual, everythingElse } = pickerZones(draft);
    expect(usual).toEqual([]);
    expect(everythingElse.length).toBe(5);
  });

  it("a freshly-added (never-logged) exercise is everything-else, not usual", () => {
    const base = partialOverview();
    const newEx: Exercise = {
      id: "tricep-pulley",
      name: "Tricep pulley",
      description: "push down",
      measurement_type: "weight_reps",
      image_key: "tricep-pulley",
      created_by: "u1",
      sort_order: 99,
    };
    const draft = createDraft(
      {
        ...base,
        exercises: [...base.exercises, newEx],
        picker_order: ["tricep-pulley", ...base.picker_order],
        states: [
          ...base.states,
          {
            exercise_id: "tricep-pulley",
            last: null,
            best: null,
            prefill: { series: [{ weight_kg: null, reps: 10 }], never_done: true },
          },
        ],
      },
      Date.now()
    );
    const { usual, everythingElse } = pickerZones(draft);
    expect(usual).not.toContain("tricep-pulley");
    // It leads everything-else (front of picker_order).
    expect(everythingElse[0]).toBe("tricep-pulley");
  });
});

describe("filterByName", () => {
  it("case-insensitively matches the exercise display name", () => {
    const draft = createDraft(partialOverview(), Date.now());
    const ids = ["back-extension", "seated-row", "farmers-carry"];
    expect(filterByName(draft, ids, "row")).toEqual(["seated-row"]);
    expect(filterByName(draft, ids, "CARRY")).toEqual(["farmers-carry"]);
  });

  it("returns the list unchanged for a blank query", () => {
    const draft = createDraft(partialOverview(), Date.now());
    const ids = ["back-extension", "seated-row"];
    expect(filterByName(draft, ids, "   ")).toEqual(ids);
  });

  it("returns empty when nothing matches", () => {
    const draft = createDraft(partialOverview(), Date.now());
    expect(filterByName(draft, ["seated-row"], "zzz")).toEqual([]);
  });
});
