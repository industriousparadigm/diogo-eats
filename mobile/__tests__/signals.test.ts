// Unit tests for lib/signals.ts — the pure day-level signals derivation
// for the looking-back surface. Honest counts, never grades. Edge cases:
// empty window, no-target profile, alcohol present, full-plant days.

import { deriveSignals } from "../lib/signals";
import type { DayAggregate } from "../lib/types";

function day(date: string, overrides: Partial<DayAggregate> = {}): DayAggregate {
  return {
    date,
    meal_count: 2,
    plant_pct: 75,
    sat_fat_g: 9,
    soluble_fiber_g: 12,
    calories: 1900,
    protein_g: 85,
    carbs_g: 200,
    alcohol_g: 0,
    kcal_burn: null,
    ...overrides,
  };
}

const TARGET = { caloriesTarget: 2000 };

describe("deriveSignals", () => {
  it("counts fully-plant days over logged days", () => {
    const aggs = [
      day("2026-06-01", { plant_pct: 100 }),
      day("2026-06-02", { plant_pct: 100 }),
      day("2026-06-03", { plant_pct: 80 }),
    ];
    const s = deriveSignals(aggs, TARGET);
    const plant = s.find((x) => x.key === "fully_plant")!;
    expect(plant.count).toBe(2);
    expect(plant.of).toBe(3); // of logged days
    expect(plant.label).toBe("days 100% plant");
  });

  it("counts alcohol days as a neutral fact", () => {
    const aggs = [
      day("2026-06-01", { alcohol_g: 14 }),
      day("2026-06-02", { alcohol_g: 0 }),
      day("2026-06-03", { alcohol_g: 28 }),
    ];
    const s = deriveSignals(aggs, TARGET);
    const alc = s.find((x) => x.key === "alcohol")!;
    expect(alc.count).toBe(2);
    expect(alc.of).toBe(3);
    expect(alc.label).toBe("days with alcohol");
  });

  it("counts days over the kcal target only when a target exists", () => {
    const aggs = [
      day("2026-06-01", { calories: 2500 }),
      day("2026-06-02", { calories: 1800 }),
      day("2026-06-03", { calories: 2100 }),
    ];
    const s = deriveSignals(aggs, TARGET);
    const over = s.find((x) => x.key === "over_kcal")!;
    expect(over.count).toBe(2);
    expect(over.of).toBe(3);
  });

  it("OMITS the over-kcal signal when there's no honest target", () => {
    const aggs = [day("2026-06-01"), day("2026-06-02")];
    const noTarget = deriveSignals(aggs, { caloriesTarget: null });
    expect(noTarget.find((x) => x.key === "over_kcal")).toBeUndefined();
    // A zero / negative target is just as dishonest a threshold — omit too.
    const zeroTarget = deriveSignals(aggs, { caloriesTarget: 0 });
    expect(zeroTarget.find((x) => x.key === "over_kcal")).toBeUndefined();
  });

  it("counts logged days over the WHOLE window (coverage honesty)", () => {
    const aggs = [
      day("2026-06-01"),
      day("2026-06-02", { meal_count: 0 }),
      day("2026-06-03"),
      day("2026-06-04", { meal_count: 0 }),
    ];
    const s = deriveSignals(aggs, TARGET);
    const logged = s.find((x) => x.key === "logged")!;
    expect(logged.count).toBe(2); // 2 logged
    expect(logged.of).toBe(4); // of 4 calendar days in the window
    expect(logged.label).toBe("days fully logged");
  });

  it("ignores unlogged days for behavior signals (alcohol/plant/kcal)", () => {
    const aggs = [
      day("2026-06-01", { plant_pct: 100, alcohol_g: 5, calories: 3000 }),
      // Unlogged day with junk values that must not be counted.
      day("2026-06-02", { meal_count: 0, plant_pct: 100, alcohol_g: 99, calories: 9999 }),
    ];
    const s = deriveSignals(aggs, TARGET);
    expect(s.find((x) => x.key === "fully_plant")!.count).toBe(1);
    expect(s.find((x) => x.key === "alcohol")!.count).toBe(1);
    expect(s.find((x) => x.key === "over_kcal")!.count).toBe(1);
    // The behavior denominators are logged days (1), not the window (2).
    expect(s.find((x) => x.key === "fully_plant")!.of).toBe(1);
  });

  it("handles an empty window without throwing — all zeros", () => {
    const s = deriveSignals([], TARGET);
    expect(s.find((x) => x.key === "fully_plant")!.count).toBe(0);
    expect(s.find((x) => x.key === "fully_plant")!.of).toBe(0);
    expect(s.find((x) => x.key === "logged")!.of).toBe(0);
    // No-target + empty: over-kcal is omitted, the rest are present at 0.
    const noTarget = deriveSignals([], { caloriesTarget: null });
    expect(noTarget.find((x) => x.key === "over_kcal")).toBeUndefined();
    expect(noTarget.length).toBe(3);
  });

  it("uses singular labels for a count of 1", () => {
    const aggs = [day("2026-06-01", { plant_pct: 100, alcohol_g: 3, calories: 2500 })];
    const s = deriveSignals(aggs, TARGET);
    expect(s.find((x) => x.key === "fully_plant")!.label).toBe("day 100% plant");
    expect(s.find((x) => x.key === "alcohol")!.label).toBe("day with alcohol");
    expect(s.find((x) => x.key === "over_kcal")!.label).toBe("day over kcal target");
    expect(s.find((x) => x.key === "logged")!.label).toBe("day fully logged");
  });
});
