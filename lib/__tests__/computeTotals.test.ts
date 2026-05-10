import { describe, it, expect } from "vitest";
import { computeTotals } from "../computeTotals";
import type { Item } from "../types";

const oats: Item = {
  name: "rolled oats",
  grams: 50,
  confidence: "high",
  is_plant: true,
  per_100g: { sat_fat_g: 1.2, soluble_fiber_g: 4, calories: 380, protein_g: 13 },
};

const banana: Item = {
  name: "banana",
  grams: 110,
  confidence: "high",
  is_plant: true,
  per_100g: { sat_fat_g: 0.1, soluble_fiber_g: 0.6, calories: 89, protein_g: 1.1 },
};

const beef: Item = {
  name: "minced beef, lean",
  grams: 60,
  confidence: "medium",
  is_plant: false,
  per_100g: { sat_fat_g: 4.5, soluble_fiber_g: 0, calories: 250, protein_g: 26 },
};

describe("computeTotals", () => {
  it("returns zeros for empty items", () => {
    const t = computeTotals([]);
    expect(t.calories).toBe(0);
    expect(t.plant_pct).toBe(0);
  });

  it("sums per-100g times grams/100 across items", () => {
    const t = computeTotals([oats, banana]);
    // oats 50g: 0.5 * (1.2, 4, 380, 13)  = (0.6, 2.0, 190, 6.5)
    // banana 110g: 1.1 * (0.1, 0.6, 89, 1.1) = (0.11, 0.66, 97.9, 1.21)
    expect(t.sat_fat_g).toBeCloseTo(0.71, 1);
    expect(t.soluble_fiber_g).toBeCloseTo(2.66, 1);
    expect(t.calories).toBeCloseTo(287.9, 0);
    expect(t.protein_g).toBeCloseTo(7.71, 1);
  });

  it("computes plant_pct as mass-weighted plant grams over total grams", () => {
    // 50g oats (plant) + 110g banana (plant) + 60g beef (not plant)
    // plant grams = 160 / 220 = 72.7%, rounded to 73
    const t = computeTotals([oats, banana, beef]);
    expect(t.plant_pct).toBe(73);
  });

  it("returns 100% plant when every item is plant", () => {
    expect(computeTotals([oats, banana]).plant_pct).toBe(100);
  });

  it("returns 0% plant when no items are plant", () => {
    expect(computeTotals([beef]).plant_pct).toBe(0);
  });

  it("ignores items missing per_100g (legacy data tolerance)", () => {
    const broken = { ...oats, per_100g: undefined as any };
    const t = computeTotals([broken, banana]);
    // Only banana contributes.
    expect(t.calories).toBeCloseTo(97.9, 0);
  });
});
