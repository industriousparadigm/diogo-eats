import { describe, it, expect } from "vitest";
import { totalsFromItems } from "../vision";
import type { Item } from "../vision";

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
  per_100g: {
    sat_fat_g: 4.5,
    soluble_fiber_g: 0,
    calories: 250,
    protein_g: 26,
    fat_g: 14,
    carbs_g: 0,
    sugar_g: 0,
    salt_g: 0.2,
  },
};

describe("totalsFromItems (server)", () => {
  it("zeros for empty list", () => {
    const t = totalsFromItems([]);
    expect(t.calories).toBe(0);
    expect(t.plant_pct).toBe(0);
    expect(t.salt_g).toBe(0);
  });

  it("rounds calories to whole, others to one decimal", () => {
    const t = totalsFromItems([oats, banana]);
    expect(Number.isInteger(t.calories)).toBe(true);
    // sat_fat decimal rounding: 0.71 should stay 0.7
    expect(t.sat_fat_g).toBeCloseTo(0.7, 1);
  });

  it("includes silent-capture nutrients when present, ignores when absent", () => {
    const t = totalsFromItems([beef]);
    // beef per_100g.salt_g is 0.2; 60g → 0.12 → rounded to 0.1
    expect(t.salt_g).toBeCloseTo(0.1, 1);
    expect(t.fat_g).toBeCloseTo(8.4, 1);
  });

  it("computes plant_pct mass-weighted across mixed items", () => {
    const t = totalsFromItems([oats, banana, beef]); // 50 + 110 = 160 plant of 220 total
    expect(t.plant_pct).toBe(73);
  });
});
