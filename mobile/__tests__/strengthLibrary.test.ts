// Library helpers — search (contains-match, blank, case) + LAST/BEST pairing.

import { libraryRows, searchExercises } from "../lib/strengthLibrary";
import { FIXTURE_EXERCISES, mockStrengthOverview } from "../lib/strengthFixtures";

describe("searchExercises", () => {
  it("returns the whole catalog for a blank or whitespace query", () => {
    expect(searchExercises(FIXTURE_EXERCISES, "")).toHaveLength(FIXTURE_EXERCISES.length);
    expect(searchExercises(FIXTURE_EXERCISES, "   ")).toHaveLength(FIXTURE_EXERCISES.length);
  });

  it("matches a substring case-insensitively", () => {
    const hits = searchExercises(FIXTURE_EXERCISES, "press");
    expect(hits.map((e) => e.id).sort()).toEqual(["chest-press", "leg-press"]);
  });

  it("matches mid-word and ignores case", () => {
    // "ROW" hits "Seated row"; "carry" hits "Farmer's carry".
    expect(searchExercises(FIXTURE_EXERCISES, "ROW").map((e) => e.id)).toEqual(["seated-row"]);
    expect(searchExercises(FIXTURE_EXERCISES, "carry").map((e) => e.id)).toEqual([
      "farmers-carry",
    ]);
  });

  it("returns nothing for a no-match query", () => {
    expect(searchExercises(FIXTURE_EXERCISES, "deadlift")).toEqual([]);
  });

  it("scales: a contains-match over 1000 names stays correct", () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({
      ...FIXTURE_EXERCISES[0],
      id: `ex-${i}`,
      name: i === 742 ? "Bulgarian split squat" : `Filler movement ${i}`,
    }));
    const hits = searchExercises(many, "bulgarian");
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("ex-742");
  });
});

describe("libraryRows", () => {
  it("pairs each exercise with its LAST/BEST state, preserving catalog order", () => {
    const ov = mockStrengthOverview();
    const rows = libraryRows(ov.exercises, ov.states);
    expect(rows.map((r) => r.exercise.id)).toEqual(ov.exercises.map((e) => e.id));
    const legPress = rows.find((r) => r.exercise.id === "leg-press");
    expect(legPress?.state?.best).toEqual({ kind: "weight", weight_kg: 39, reps: 12 });
  });

  it("yields a null state for an exercise with no scoreboard entry", () => {
    const rows = libraryRows(FIXTURE_EXERCISES, []); // no states at all
    expect(rows).toHaveLength(FIXTURE_EXERCISES.length);
    expect(rows.every((r) => r.state === null)).toBe(true);
  });
});
