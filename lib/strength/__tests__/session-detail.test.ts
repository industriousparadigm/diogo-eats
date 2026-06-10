// Tests for beatsForSession — the pure logic behind
// GET /api/strength/sessions/[id]. It must REUSE the beat engine
// (computeSessionBeats), comparing a session only against sessions that
// completed strictly before it, never against itself or later ones.

import { describe, it, expect } from "vitest";
import { beatsForSession, computeSessionBeats, sortSessions } from "../engine";
import type { Exercise, StrengthSession, StrengthSet } from "../types";

const LEG: Exercise = {
  id: "leg-press",
  name: "Leg press",
  description: "",
  measurement_type: "weight_reps",
  image_key: "leg-press",
  sort_order: 1,
};
const BACK: Exercise = {
  id: "back-extension",
  name: "Back extension",
  description: "",
  measurement_type: "bodyweight_reps",
  image_key: "back-extension",
  sort_order: 2,
};
const ROW: Exercise = {
  id: "seated-row",
  name: "Seated row",
  description: "",
  measurement_type: "weight_reps",
  image_key: "seated-row",
  sort_order: 3,
};
const EXERCISES = [LEG, BACK, ROW];

function ts(ymd: string, hourUtc = 12): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hourUtc);
}

type SetSpec = [exerciseId: string, series: number, weight: number | null, reps: number];

function makeSession(id: string, ymd: string, setSpecs: SetSpec[]): StrengthSession {
  const completed = ts(ymd);
  return {
    id,
    started_at: completed - 45 * 60 * 1000,
    completed_at: completed,
    note: null,
    sets: setSpecs.map(([exercise_id, series_index, weight_kg, reps]) => ({
      exercise_id,
      series_index,
      weight_kg,
      reps,
    })),
  };
}

describe("beatsForSession", () => {
  const day1 = makeSession("s1", "2026-06-10", [
    ["leg-press", 1, 32, 12],
    ["leg-press", 2, 39, 12],
    ["back-extension", 1, null, 12],
    ["back-extension", 2, null, 12],
    ["seated-row", 1, 25, 12],
    ["seated-row", 2, 32, 12],
  ]);
  // Heavier leg press (39 -> 41), more back-ext reps (24 -> 30), row unchanged.
  const day2 = makeSession("s2", "2026-06-13", [
    ["leg-press", 1, 41, 10],
    ["back-extension", 1, null, 15],
    ["back-extension", 2, null, 15],
    ["seated-row", 1, 25, 12],
    ["seated-row", 2, 32, 12],
  ]);

  const history = [day1, day2];

  it("the first-ever session has zero beats (nothing before it)", () => {
    expect(beatsForSession(EXERCISES, history, "s1")).toEqual([]);
  });

  it("detects the beats a later session achieved vs the previous one", () => {
    const beats = beatsForSession(EXERCISES, history, "s2");
    const byId = new Map(beats.map((b) => [b.exercise_id, b]));
    expect(byId.get("leg-press")).toMatchObject({ kind: "weight", from: 39, to: 41 });
    expect(byId.get("back-extension")).toMatchObject({ kind: "total_reps", from: 24, to: 30 });
    // Row repeated exactly — not a beat.
    expect(byId.has("seated-row")).toBe(false);
  });

  it("is exactly computeSessionBeats over the strictly-prior slice", () => {
    const sorted = sortSessions(history);
    const idx = sorted.findIndex((s) => s.id === "s2");
    const reference = computeSessionBeats(EXERCISES, sorted.slice(0, idx), sorted[idx]);
    expect(beatsForSession(EXERCISES, history, "s2")).toEqual(reference);
  });

  it("ignores sessions completed AFTER the target (only prior sessions count)", () => {
    // Asking about s1 must NOT be influenced by s2 existing in history.
    expect(beatsForSession(EXERCISES, history, "s1")).toEqual([]);
  });

  it("returns [] for an unknown session id", () => {
    expect(beatsForSession(EXERCISES, history, "does-not-exist")).toEqual([]);
  });

  it("tolerates unordered history input", () => {
    const shuffled = [day2, day1];
    const beats = beatsForSession(EXERCISES, shuffled, "s2");
    expect(beats.find((b) => b.exercise_id === "leg-press")).toMatchObject({
      kind: "weight",
      from: 39,
      to: 41,
    });
  });
});
