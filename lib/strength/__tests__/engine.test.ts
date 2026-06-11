import { describe, it, expect } from "vitest";
import {
  bestForExercise,
  buildOverview,
  computeExerciseBeat,
  computeSessionBeats,
  exercisesInLoggedOrder,
  lastForExercise,
  pickerOrder,
  prefillForExercise,
  previousSessionWithExercise,
  setsForExercise,
  sortSessions,
} from "../engine";
import type { Exercise, StrengthSession, StrengthSet } from "../types";

// ---- fixtures ----

const LEG: Exercise = {
  id: "leg-press",
  name: "Leg press",
  description: "",
  measurement_type: "weight_reps",
  image_key: "leg-press",
  created_by: null,
  sort_order: 1,
};
const BACK: Exercise = {
  id: "back-extension",
  name: "Back extension",
  description: "",
  measurement_type: "bodyweight_reps",
  image_key: "back-extension",
  created_by: null,
  sort_order: 2,
};
const CHEST: Exercise = {
  id: "chest-press",
  name: "Chest press",
  description: "",
  measurement_type: "weight_reps",
  image_key: "chest-press",
  created_by: null,
  sort_order: 3,
};
const ROW: Exercise = {
  id: "seated-row",
  name: "Seated row",
  description: "",
  measurement_type: "weight_reps",
  image_key: "seated-row",
  created_by: null,
  sort_order: 4,
};
const CARRY: Exercise = {
  id: "farmers-carry",
  name: "Farmer's carry",
  description: "",
  measurement_type: "carry",
  image_key: "farmers-carry",
  created_by: null,
  sort_order: 5,
};
const EXERCISES = [LEG, BACK, CHEST, ROW, CARRY];

// 12:00 UTC = 12:00 or 13:00 Lisbon depending on season — always the
// same calendar day, so fixtures are unambiguous.
function ts(ymd: string, hourUtc = 12): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hourUtc);
}

type SetSpec = [exerciseId: string, series: number, weight: number | null, reps: number];

function makeSession(
  id: string,
  ymd: string,
  setSpecs: SetSpec[],
  opts: { note?: string | null; hourUtc?: number } = {}
): StrengthSession {
  const completed = ts(ymd, opts.hourUtc ?? 12);
  return {
    id,
    started_at: completed - 45 * 60 * 1000,
    completed_at: completed,
    note: opts.note ?? null,
    sets: setSpecs.map(([exercise_id, series_index, weight_kg, reps]) => ({
      exercise_id,
      series_index,
      weight_kg,
      reps,
    })),
  };
}

// The real day-1 baseline (10 Jun 2026).
function day1(id = "s1", ymd = "2026-06-10"): StrengthSession {
  return makeSession(id, ymd, [
    ["leg-press", 1, 32, 12],
    ["leg-press", 2, 39, 12],
    ["back-extension", 1, null, 12],
    ["back-extension", 2, null, 12],
    ["chest-press", 1, 32, 12],
    ["chest-press", 2, 32, 12],
    ["seated-row", 1, 25, 12],
    ["seated-row", 2, 32, 12],
    ["farmers-carry", 1, 16, 60],
    ["farmers-carry", 2, 16, 60],
  ]);
}

function sets(...specs: Array<[number, number | null, number]>): StrengthSet[] {
  return specs.map(([series_index, weight_kg, reps]) => ({
    exercise_id: "x",
    series_index,
    weight_kg,
    reps,
  }));
}

// ---- sortSessions ----

describe("sortSessions", () => {
  it("orders chronologically ascending and does not mutate the input", () => {
    const a = day1("a", "2026-06-12");
    const b = day1("b", "2026-06-10");
    const input = [a, b];
    const out = sortSessions(input);
    expect(out.map((s) => s.id)).toEqual(["b", "a"]);
    expect(input.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

// ---- beat detection: weight_reps ----

describe("computeExerciseBeat — weight_reps", () => {
  const prev = sets([1, 32, 12], [2, 39, 12]); // day-1 leg press

  it("max weight increased is a beat (weight kind)", () => {
    const today = sets([1, 39, 10], [2, 41, 8]);
    const beat = computeExerciseBeat("weight_reps", "leg-press", today, prev);
    expect(beat).toEqual({
      exercise_id: "leg-press",
      kind: "weight",
      from: 39,
      to: 41,
    });
  });

  it("weight raised mid-session counts via the max (32 then 39 vs prior 32-only)", () => {
    const prior32 = sets([1, 32, 12], [2, 32, 12]);
    const today = sets([1, 32, 12], [2, 39, 12]);
    const beat = computeExerciseBeat("weight_reps", "leg-press", today, prior32);
    expect(beat?.kind).toBe("weight");
    expect(beat?.from).toBe(32);
    expect(beat?.to).toBe(39);
  });

  it("equal max weight with more total reps at that weight is a beat", () => {
    // prev: one series at 39 (12 reps). today: two series at 39.
    const today = sets([1, 39, 12], [2, 39, 12]);
    const beat = computeExerciseBeat("weight_reps", "leg-press", today, prev);
    expect(beat).toEqual({
      exercise_id: "leg-press",
      kind: "reps_at_weight",
      from: 12,
      to: 24,
      at_weight_kg: 39,
    });
  });

  it("exactly equal numbers is NOT a beat", () => {
    const today = sets([1, 32, 12], [2, 39, 12]);
    expect(computeExerciseBeat("weight_reps", "leg-press", today, prev)).toBeNull();
  });

  it("fewer series than last time at the same top weight is NOT a beat", () => {
    const prior = sets([1, 32, 12], [2, 32, 12]); // 24 reps at 32
    const today = sets([1, 32, 12]); // only 12 at 32
    expect(computeExerciseBeat("weight_reps", "x", today, prior)).toBeNull();
  });

  it("lower max weight is NOT a beat even with far more reps", () => {
    const today = sets([1, 32, 30], [2, 32, 30]);
    expect(computeExerciseBeat("weight_reps", "x", today, prev)).toBeNull();
  });

  it("equal max weight with fewer reps at it is NOT a beat", () => {
    const today = sets([1, 32, 12], [2, 39, 10]);
    expect(computeExerciseBeat("weight_reps", "x", today, prev)).toBeNull();
  });

  it("returns null when either side has no sets", () => {
    expect(computeExerciseBeat("weight_reps", "x", [], prev)).toBeNull();
    expect(computeExerciseBeat("weight_reps", "x", prev, [])).toBeNull();
  });
});

// ---- beat detection: bodyweight_reps ----

describe("computeExerciseBeat — bodyweight_reps", () => {
  const prev = sets([1, null, 12], [2, null, 12]); // total 24

  it("more total reps is a beat", () => {
    const today = sets([1, null, 13], [2, null, 12]);
    expect(computeExerciseBeat("bodyweight_reps", "back-extension", today, prev)).toEqual({
      exercise_id: "back-extension",
      kind: "total_reps",
      from: 24,
      to: 25,
    });
  });

  it("an extra series counts toward the total", () => {
    const today = sets([1, null, 8], [2, null, 8], [3, null, 9]); // 25 > 24
    expect(computeExerciseBeat("bodyweight_reps", "x", today, prev)?.to).toBe(25);
  });

  it("equal total is NOT a beat", () => {
    const today = sets([1, null, 14], [2, null, 10]); // still 24
    expect(computeExerciseBeat("bodyweight_reps", "x", today, prev)).toBeNull();
  });

  it("fewer total reps is NOT a beat", () => {
    const today = sets([1, null, 12], [2, null, 11]);
    expect(computeExerciseBeat("bodyweight_reps", "x", today, prev)).toBeNull();
  });

  it("added weight is invisible to the total-reps comparison (v0 semantics)", () => {
    // The beat definition for bodyweight work counts reps only — a 5kg
    // plate with equal reps is not (yet) a beat; one more rep is.
    const withPlate = sets([1, 5, 12], [2, 5, 12]); // 24, weighted
    expect(computeExerciseBeat("bodyweight_reps", "x", withPlate, prev)).toBeNull();
    const withPlateMore = sets([1, 5, 13], [2, 5, 12]); // 25 > 24
    expect(computeExerciseBeat("bodyweight_reps", "x", withPlateMore, prev)?.to).toBe(25);
  });
});

// ---- beat detection: carry ----

describe("computeExerciseBeat — carry", () => {
  const prev = sets([1, 16, 60], [2, 16, 60]); // day-1 carry

  it("kg increased is a beat even with fewer steps (kg beats steps)", () => {
    const today = sets([1, 18, 40], [2, 18, 40]);
    expect(computeExerciseBeat("carry", "farmers-carry", today, prev)).toEqual({
      exercise_id: "farmers-carry",
      kind: "weight",
      from: 16,
      to: 18,
    });
  });

  it("same kg with more total steps is a beat", () => {
    const today = sets([1, 16, 70], [2, 16, 60]);
    expect(computeExerciseBeat("carry", "farmers-carry", today, prev)).toEqual({
      exercise_id: "farmers-carry",
      kind: "steps_at_weight",
      from: 120,
      to: 130,
      at_weight_kg: 16,
    });
  });

  it("lower kg is NOT a beat even with many more steps", () => {
    const today = sets([1, 14, 100], [2, 14, 100]);
    expect(computeExerciseBeat("carry", "x", today, prev)).toBeNull();
  });

  it("same kg, same steps is NOT a beat", () => {
    const today = sets([1, 16, 60], [2, 16, 60]);
    expect(computeExerciseBeat("carry", "x", today, prev)).toBeNull();
  });

  it("steps at a weight below today's max don't count toward the comparison", () => {
    // Today: one series at 18kg with 30 steps, one at 16 with 100.
    // Max kg went up — weight beat, the 16kg steps are irrelevant.
    const today = sets([1, 18, 30], [2, 16, 100]);
    expect(computeExerciseBeat("carry", "x", today, prev)?.kind).toBe("weight");
  });

  it("kg raised mid-session counts via the max, like leg press 32→39", () => {
    const today = sets([1, 16, 60], [2, 18, 40]);
    expect(computeExerciseBeat("carry", "x", today, prev)).toEqual({
      exercise_id: "x",
      kind: "weight",
      from: 16,
      to: 18,
    });
  });
});

// ---- previousSessionWithExercise / session beats ----

describe("previousSessionWithExercise", () => {
  it("skips sessions that don't contain the exercise", () => {
    const s1 = day1("s1", "2026-06-10");
    const s2 = makeSession("s2", "2026-06-12", [["chest-press", 1, 34, 10]]);
    const found = previousSessionWithExercise([s2, s1], "leg-press");
    expect(found?.id).toBe("s1");
  });

  it("returns null when the exercise was never done", () => {
    expect(previousSessionWithExercise([day1()], "deadlift")).toBeNull();
  });

  it("returns null for empty history", () => {
    expect(previousSessionWithExercise([], "leg-press")).toBeNull();
  });
});

describe("computeSessionBeats", () => {
  it("first-ever session has zero beats (nothing to beat)", () => {
    expect(computeSessionBeats(EXERCISES, [], day1())).toEqual([]);
  });

  it("a never-done exercise inside a later session yields no beat for it", () => {
    const s1 = makeSession("s1", "2026-06-10", [["leg-press", 1, 32, 12]]);
    const s2 = makeSession("s2", "2026-06-12", [
      ["leg-press", 1, 39, 12], // beat
      ["chest-press", 1, 32, 12], // first time — no beat
    ]);
    const beats = computeSessionBeats(EXERCISES, [s1], s2);
    expect(beats.map((b) => b.exercise_id)).toEqual(["leg-press"]);
  });

  it("compares against the most recent previous session CONTAINING the exercise", () => {
    const s1 = makeSession("s1", "2026-06-08", [["seated-row", 1, 32, 12]]);
    const s2 = makeSession("s2", "2026-06-10", [["leg-press", 1, 39, 12]]); // no row
    const s3 = makeSession("s3", "2026-06-12", [["seated-row", 1, 34, 10]]);
    const beats = computeSessionBeats(EXERCISES, [s1, s2], s3);
    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({ kind: "weight", from: 32, to: 34 });
  });

  it("collects one beat per exercise, in the session's logged order", () => {
    const s2 = makeSession("s2", "2026-06-12", [
      ["farmers-carry", 1, 18, 60], // logged first today
      ["leg-press", 1, 41, 10],
      ["back-extension", 1, null, 12],
      ["back-extension", 2, null, 12], // equal — no beat
    ]);
    const beats = computeSessionBeats(EXERCISES, [day1()], s2);
    expect(beats.map((b) => b.exercise_id)).toEqual(["farmers-carry", "leg-press"]);
  });

  it("ignores sets for exercises missing from the catalog instead of throwing", () => {
    const s2 = makeSession("s2", "2026-06-12", [["mystery", 1, 10, 10]]);
    expect(computeSessionBeats(EXERCISES, [day1()], s2)).toEqual([]);
  });
});

// ---- prefill ----

describe("prefillForExercise", () => {
  it("returns last session's numbers series-for-series", () => {
    const prefill = prefillForExercise([day1()], "leg-press");
    expect(prefill).toEqual({
      series: [
        { weight_kg: 32, reps: 12 },
        { weight_kg: 39, reps: 12 },
      ],
      never_done: false,
    });
  });

  it("uses the MOST RECENT session containing the exercise", () => {
    const s2 = makeSession("s2", "2026-06-12", [["leg-press", 1, 41, 10]]);
    const prefill = prefillForExercise([s2, day1()], "leg-press");
    expect(prefill.series).toEqual([{ weight_kg: 41, reps: 10 }]);
  });

  it("never-done: weight empty, reps default 10, two series", () => {
    expect(prefillForExercise([day1()], "deadlift")).toEqual({
      series: [
        { weight_kg: null, reps: 10 },
        { weight_kg: null, reps: 10 },
      ],
      never_done: true,
    });
  });

  it("empty history: never-done defaults for everything", () => {
    const prefill = prefillForExercise([], "leg-press");
    expect(prefill.never_done).toBe(true);
    expect(prefill.series).toHaveLength(2);
  });

  it("series come back ordered by series_index even if stored shuffled", () => {
    const s = makeSession("s", "2026-06-10", [
      ["leg-press", 2, 39, 12],
      ["leg-press", 1, 32, 12],
    ]);
    const prefill = prefillForExercise([s], "leg-press");
    expect(prefill.series).toEqual([
      { weight_kg: 32, reps: 12 },
      { weight_kg: 39, reps: 12 },
    ]);
  });
});

// ---- last / best ----

describe("lastForExercise", () => {
  it("null when never done", () => {
    expect(lastForExercise([], "leg-press")).toBeNull();
  });

  it("returns the latest series with session metadata", () => {
    const s1 = day1();
    const last = lastForExercise([s1], "seated-row");
    expect(last?.session_id).toBe("s1");
    expect(last?.completed_at).toBe(s1.completed_at);
    expect(last?.series).toEqual([
      { weight_kg: 25, reps: 12 },
      { weight_kg: 32, reps: 12 },
    ]);
  });
});

describe("bestForExercise", () => {
  it("null when never done", () => {
    expect(bestForExercise([], LEG)).toBeNull();
  });

  it("weight_reps: heaviest ever + best single-series reps at that weight", () => {
    const s2 = makeSession("s2", "2026-06-12", [
      ["leg-press", 1, 39, 10],
      ["leg-press", 2, 41, 8],
    ]);
    expect(bestForExercise([day1(), s2], LEG)).toEqual({
      kind: "weight",
      weight_kg: 41,
      reps: 8,
    });
  });

  it("weight_reps: best reps at the top weight can come from an older session", () => {
    const s2 = makeSession("s2", "2026-06-12", [["leg-press", 1, 39, 9]]);
    // Day 1 had 39x12 — best at 39kg stays 12 even though s2 is newer.
    expect(bestForExercise([day1(), s2], LEG)).toEqual({
      kind: "weight",
      weight_kg: 39,
      reps: 12,
    });
  });

  it("bodyweight: best single-session total reps", () => {
    const s2 = makeSession("s2", "2026-06-12", [
      ["back-extension", 1, null, 13],
      ["back-extension", 2, null, 13],
    ]);
    expect(bestForExercise([day1(), s2], BACK)).toEqual({
      kind: "total_reps",
      reps: 26,
    });
  });

  it("carry: heaviest kg + best single-series steps at that kg", () => {
    const s2 = makeSession("s2", "2026-06-12", [
      ["farmers-carry", 1, 18, 45],
      ["farmers-carry", 2, 18, 50],
    ]);
    expect(bestForExercise([day1(), s2], CARRY)).toEqual({
      kind: "weight",
      weight_kg: 18,
      reps: 50,
    });
  });
});

// ---- picker order ----

describe("pickerOrder", () => {
  it("no history: catalog sort_order", () => {
    expect(pickerOrder(EXERCISES, [])).toEqual([
      "leg-press",
      "back-extension",
      "chest-press",
      "seated-row",
      "farmers-carry",
    ]);
  });

  it("last session's exercises lead, in their logged order", () => {
    const s2 = makeSession("s2", "2026-06-12", [
      ["seated-row", 1, 32, 12],
      ["farmers-carry", 1, 16, 60],
    ]);
    expect(pickerOrder(EXERCISES, [day1(), s2])).toEqual([
      "seated-row",
      "farmers-carry",
      "leg-press",
      "back-extension",
      "chest-press",
    ]);
  });

  it("uses the LAST session even when history arrives unsorted", () => {
    const s2 = makeSession("s2", "2026-06-12", [["chest-press", 1, 32, 12]]);
    expect(pickerOrder(EXERCISES, [s2, day1()])[0]).toBe("chest-press");
  });

  it("ignores exercises in history that left the catalog", () => {
    const s = makeSession("s", "2026-06-12", [["retired-move", 1, 10, 10]]);
    const order = pickerOrder(EXERCISES, [s]);
    expect(order).toHaveLength(5);
    expect(order).not.toContain("retired-move");
  });
});

// ---- misc helpers ----

describe("setsForExercise / exercisesInLoggedOrder", () => {
  it("setsForExercise filters and sorts by series_index", () => {
    const s = day1();
    expect(setsForExercise(s, "farmers-carry")).toHaveLength(2);
    expect(setsForExercise(s, "nothing")).toEqual([]);
  });

  it("exercisesInLoggedOrder dedupes by first appearance", () => {
    expect(exercisesInLoggedOrder(day1())).toEqual([
      "leg-press",
      "back-extension",
      "chest-press",
      "seated-row",
      "farmers-carry",
    ]);
  });
});

// ---- buildOverview ----

describe("buildOverview", () => {
  it("empty history: all states never-done, no sessions", () => {
    const o = buildOverview(EXERCISES, []);
    expect(o.sessions).toEqual([]);
    expect(o.states).toHaveLength(5);
    for (const st of o.states) {
      expect(st.last).toBeNull();
      expect(st.best).toBeNull();
      expect(st.prefill.never_done).toBe(true);
    }
  });

  it("after day 1: last/best/prefill greet with the baseline numbers", () => {
    const o = buildOverview(EXERCISES, [day1()]);
    const leg = o.states.find((s) => s.exercise_id === "leg-press")!;
    expect(leg.prefill.series).toEqual([
      { weight_kg: 32, reps: 12 },
      { weight_kg: 39, reps: 12 },
    ]);
    expect(leg.best).toEqual({ kind: "weight", weight_kg: 39, reps: 12 });
    expect(o.sessions).toHaveLength(1);
    expect(o.sessions[0].beats_count).toBe(0); // first ever — nothing to beat
    expect(o.sessions[0].exercise_ids).toHaveLength(5);
  });

  it("sessions list is newest first with per-session beats counts", () => {
    const s2 = makeSession("s2", "2026-06-12", [
      ["leg-press", 1, 41, 10], // beat
      ["chest-press", 1, 32, 12],
      ["chest-press", 2, 32, 12], // equal — no beat
    ]);
    const o = buildOverview(EXERCISES, [day1(), s2]);
    expect(o.sessions.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(o.sessions[0].beats_count).toBe(1);
    expect(o.sessions[1].beats_count).toBe(0);
  });

  it("states follow picker order", () => {
    const s2 = makeSession("s2", "2026-06-12", [["farmers-carry", 1, 18, 60]]);
    const o = buildOverview(EXERCISES, [day1(), s2]);
    expect(o.picker_order[0]).toBe("farmers-carry");
    expect(o.states[0].exercise_id).toBe("farmers-carry");
  });
});
