// Pure-logic tests for the strength DETAIL derivations: grouping a
// session's sets by exercise, per-exercise chronological history, and the
// progression-sparkline metric. These are presentation derivations (the
// beat rule stays in the backend engine), so they're tested standalone.

import {
  exerciseHistory,
  groupSetsByExercise,
  progression,
} from "../lib/strengthHistory";
import type { StrengthSession } from "../lib/strengthTypes";

function session(
  id: string,
  completedAt: number,
  sets: StrengthSession["sets"]
): StrengthSession {
  return { id, started_at: completedAt - 1000, completed_at: completedAt, note: null, sets };
}

describe("groupSetsByExercise", () => {
  it("groups by exercise in first-logged order, series sorted by index", () => {
    const s = session("s1", 100, [
      { exercise_id: "leg-press", series_index: 2, weight_kg: 39, reps: 12 },
      { exercise_id: "chest-press", series_index: 1, weight_kg: 32, reps: 12 },
      { exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 12 },
    ]);
    const groups = groupSetsByExercise(s);
    expect(groups.map((g) => g.exercise_id)).toEqual(["leg-press", "chest-press"]);
    // leg-press series re-sorted 1 then 2 even though logged 2 then 1.
    expect(groups[0].series).toEqual([
      { weight_kg: 32, reps: 12 },
      { weight_kg: 39, reps: 12 },
    ]);
    expect(groups[1].series).toEqual([{ weight_kg: 32, reps: 12 }]);
  });

  it("handles an empty session", () => {
    expect(groupSetsByExercise(session("s1", 100, []))).toEqual([]);
  });
});

describe("exerciseHistory", () => {
  const s1 = session("s1", 100, [{ exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 12 }]);
  const s2 = session("s2", 200, [
    { exercise_id: "leg-press", series_index: 1, weight_kg: 39, reps: 10 },
    { exercise_id: "chest-press", series_index: 1, weight_kg: 30, reps: 12 },
  ]);
  const s3 = session("s3", 300, [{ exercise_id: "chest-press", series_index: 1, weight_kg: 32, reps: 12 }]);

  it("returns only sessions containing the exercise, newest first", () => {
    const h = exerciseHistory([s1, s2, s3], "leg-press");
    expect(h.map((e) => e.session_id)).toEqual(["s2", "s1"]); // newest first; s3 omitted
    expect(h[0].series).toEqual([{ weight_kg: 39, reps: 10 }]);
  });

  it("sorts regardless of input order", () => {
    const h = exerciseHistory([s3, s1, s2], "chest-press");
    expect(h.map((e) => e.session_id)).toEqual(["s3", "s2"]);
  });

  it("returns [] for an exercise that was never done", () => {
    expect(exerciseHistory([s1, s2, s3], "seated-row")).toEqual([]);
  });
});

describe("progression", () => {
  const s1 = session("s1", 100, [
    { exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 12 },
    { exercise_id: "leg-press", series_index: 2, weight_kg: 39, reps: 12 },
  ]);
  const s2 = session("s2", 200, [
    { exercise_id: "leg-press", series_index: 1, weight_kg: 41, reps: 10 },
  ]);
  const back1 = session("b1", 100, [
    { exercise_id: "back-extension", series_index: 1, weight_kg: null, reps: 12 },
    { exercise_id: "back-extension", series_index: 2, weight_kg: null, reps: 12 },
  ]);
  const back2 = session("b2", 200, [
    { exercise_id: "back-extension", series_index: 1, weight_kg: null, reps: 15 },
    { exercise_id: "back-extension", series_index: 2, weight_kg: null, reps: 15 },
  ]);

  it("weight_reps: top weight per session, chronological", () => {
    const p = progression([s2, s1], "leg-press", "weight_reps");
    expect(p).toEqual([
      { completed_at: 100, value: 39 }, // top of s1
      { completed_at: 200, value: 41 }, // top of s2
    ]);
  });

  it("bodyweight_reps: total reps per session", () => {
    const p = progression([back2, back1], "back-extension", "bodyweight_reps");
    expect(p).toEqual([
      { completed_at: 100, value: 24 },
      { completed_at: 200, value: 30 },
    ]);
  });

  it("carry: top weight (per hand) per session", () => {
    const c = session("c1", 50, [
      { exercise_id: "farmers-carry", series_index: 1, weight_kg: 16, reps: 60 },
    ]);
    expect(progression([c], "farmers-carry", "carry")).toEqual([{ completed_at: 50, value: 16 }]);
  });

  it("omits sessions that didn't include the exercise", () => {
    const other = session("o1", 150, [{ exercise_id: "seated-row", series_index: 1, weight_kg: 25, reps: 12 }]);
    const p = progression([s1, other, s2], "leg-press", "weight_reps");
    expect(p.map((pt) => pt.completed_at)).toEqual([100, 200]);
  });
});
