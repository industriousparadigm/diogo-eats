// Unit tests for lib/types.ts — pure data functions.

import { parseItems, computeDayTotals, totalsFromItems, round1 } from "../lib/types";
import type { Item, Meal } from "../lib/types";

function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "test-id",
    created_at: Date.now(),
    photo_filename: null,
    items_json: JSON.stringify([
      { name: "Oatmeal", grams: 200, confidence: "high", is_plant: true, per_100g: { sat_fat_g: 0.8, soluble_fiber_g: 4, calories: 389, protein_g: 17 } },
      { name: "Egg", grams: 50, confidence: "high", is_plant: false, per_100g: { sat_fat_g: 3.1, soluble_fiber_g: 0, calories: 155, protein_g: 13 } },
    ]),
    sat_fat_g: 3.2,
    soluble_fiber_g: 8,
    calories: 855,
    protein_g: 40.5,
    plant_pct: 80,
    notes: null,
    caption: null,
    meal_vibe: "breakfast",
    ...overrides,
  };
}

describe("parseItems", () => {
  it("parses valid items_json", () => {
    const items = parseItems(JSON.stringify([
      { name: "Oatmeal", grams: 200, confidence: "high", is_plant: true, per_100g: {} },
    ]));
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Oatmeal");
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseItems("not json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseItems('{"key":"value"}')).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseItems("")).toEqual([]);
  });

  it("returns empty array for empty JSON array", () => {
    expect(parseItems("[]")).toEqual([]);
  });
});

describe("computeDayTotals", () => {
  it("returns zeros for empty meals array", () => {
    const totals = computeDayTotals([]);
    expect(totals.calories).toBe(0);
    expect(totals.protein_g).toBe(0);
    expect(totals.sat_fat_g).toBe(0);
    expect(totals.soluble_fiber_g).toBe(0);
    expect(totals.plant_pct).toBe(0);
  });

  it("sums totals across multiple meals", () => {
    const meal1 = makeMeal({ calories: 500, protein_g: 30, sat_fat_g: 5, soluble_fiber_g: 4 });
    const meal2 = makeMeal({ calories: 700, protein_g: 20, sat_fat_g: 8, soluble_fiber_g: 3 });
    const totals = computeDayTotals([meal1, meal2]);
    expect(totals.calories).toBe(1200);
    expect(totals.protein_g).toBe(50);
    expect(totals.sat_fat_g).toBe(13);
    expect(totals.soluble_fiber_g).toBe(7);
  });

  it("computes plant_pct from items (mass-weighted)", () => {
    // Both meals have the same items: 200g plant + 50g non-plant = 80% plant
    const meal1 = makeMeal();
    const meal2 = makeMeal();
    const totals = computeDayTotals([meal1, meal2]);
    // 400g plant out of 500g total = 80%
    expect(totals.plant_pct).toBe(80);
  });

  it("handles meals with no items gracefully", () => {
    const meal = makeMeal({ items_json: "[]" });
    const totals = computeDayTotals([meal]);
    expect(totals.plant_pct).toBe(0);
  });

  it("rounds calories to whole number", () => {
    const meal = makeMeal({ calories: 499.7 });
    const totals = computeDayTotals([meal]);
    expect(Number.isInteger(totals.calories)).toBe(true);
    expect(totals.calories).toBe(500);
  });
});

function item(overrides: Partial<Item> = {}): Item {
  return {
    name: "Oats",
    grams: 100,
    confidence: "high",
    is_plant: true,
    per_100g: { sat_fat_g: 1.2, soluble_fiber_g: 4, calories: 380, protein_g: 13 },
    ...overrides,
  };
}

describe("round1", () => {
  it("rounds to one decimal", () => {
    expect(round1(1.234)).toBe(1.2);
    expect(round1(1.25)).toBe(1.3);
    expect(round1(10)).toBe(10);
  });
});

describe("totalsFromItems", () => {
  it("scales per-100g by grams across the full nutrient set", () => {
    const t = totalsFromItems([
      item({ grams: 200, per_100g: { sat_fat_g: 1, soluble_fiber_g: 4, calories: 380, protein_g: 13, fat_g: 7, carbs_g: 66 } }),
    ]);
    expect(t.calories).toBe(760);
    expect(t.sat_fat_g).toBe(2);
    expect(t.soluble_fiber_g).toBe(8);
    expect(t.protein_g).toBe(26);
    expect(t.fat_g).toBe(14);
    expect(t.carbs_g).toBe(132);
    expect(t.plant_pct).toBe(100);
  });

  it("computes mass-weighted plant percent", () => {
    const t = totalsFromItems([
      item({ grams: 100, is_plant: true }),
      item({ name: "Chicken", grams: 50, is_plant: false }),
    ]);
    expect(t.plant_pct).toBe(67); // 100/150
  });

  it("skips items without per_100g (legacy rows)", () => {
    const legacy = { name: "Old", grams: 100, confidence: "high", is_plant: true } as unknown as Item;
    const t = totalsFromItems([legacy, item({ grams: 100 })]);
    expect(t.calories).toBe(380);
    expect(t.plant_pct).toBe(100);
  });

  it("matches what the server persists (rounded calories, 1dp macros)", () => {
    const t = totalsFromItems([item({ grams: 33 })]);
    expect(Number.isInteger(t.calories)).toBe(true);
    expect(t.soluble_fiber_g).toBe(round1(t.soluble_fiber_g));
  });
});
