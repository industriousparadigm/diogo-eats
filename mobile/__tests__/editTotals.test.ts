// Unit tests for lib/editTotals.ts — the live-totals math during meal
// editing. Mirrors the server's totalsFromItems so what the user sees
// while tweaking grams is what gets persisted.

import { computeTotals } from "../lib/editTotals";
import type { Item } from "../lib/types";

function item(overrides: Partial<Item> = {}): Item {
  return {
    name: "Oatmeal",
    grams: 100,
    confidence: "high",
    is_plant: true,
    per_100g: { sat_fat_g: 1, soluble_fiber_g: 4, calories: 380, protein_g: 13 },
    ...overrides,
  };
}

describe("computeTotals", () => {
  it("returns zeros for an empty list", () => {
    expect(computeTotals([])).toEqual({
      sat_fat_g: 0,
      soluble_fiber_g: 0,
      calories: 0,
      protein_g: 0,
      plant_pct: 0,
    });
  });

  it("scales per-100g values by grams", () => {
    const t = computeTotals([item({ grams: 200 })]);
    expect(t.sat_fat_g).toBeCloseTo(2);
    expect(t.soluble_fiber_g).toBeCloseTo(8);
    expect(t.calories).toBeCloseTo(760);
    expect(t.protein_g).toBeCloseTo(26);
    expect(t.plant_pct).toBe(100);
  });

  it("sums across items", () => {
    const t = computeTotals([
      item({ grams: 100 }),
      item({ name: "Cheese", grams: 50, is_plant: false, per_100g: { sat_fat_g: 20, soluble_fiber_g: 0, calories: 400, protein_g: 25 } }),
    ]);
    expect(t.sat_fat_g).toBeCloseTo(1 + 10);
    expect(t.calories).toBeCloseTo(380 + 200);
  });

  it("computes mass-weighted plant percent, rounded", () => {
    const t = computeTotals([
      item({ grams: 100, is_plant: true }),
      item({ name: "Chicken", grams: 50, is_plant: false }),
    ]);
    // 100 / 150 = 66.67 -> 67
    expect(t.plant_pct).toBe(67);
  });

  it("updates when grams change (the live-edit case)", () => {
    const before = computeTotals([item({ grams: 100 })]);
    const after = computeTotals([item({ grams: 150 })]);
    expect(after.calories).toBeCloseTo(before.calories * 1.5);
  });

  it("ignores items without per_100g (legacy rows)", () => {
    const legacy = { name: "Old", grams: 100, confidence: "high", is_plant: true } as unknown as Item;
    const t = computeTotals([legacy, item({ grams: 100 })]);
    expect(t.calories).toBeCloseTo(380);
    // Legacy grams don't count toward plant mass either.
    expect(t.plant_pct).toBe(100);
  });

  it("handles zero grams", () => {
    const t = computeTotals([item({ grams: 0 })]);
    expect(t.calories).toBe(0);
    expect(t.plant_pct).toBe(0);
  });
});
