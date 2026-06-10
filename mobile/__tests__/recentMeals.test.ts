// Unit tests for lib/recentMeals.ts — the capture-sheet repeat row's
// search filter + label logic.

import { filterRecentMeals, recentMealLabel } from "../lib/recentMeals";
import type { Meal } from "../lib/types";

function meal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: Date.now(),
    photo_filename: null,
    items_json: JSON.stringify([
      { name: "Oats", grams: 80, confidence: "high", is_plant: true, per_100g: { sat_fat_g: 1, soluble_fiber_g: 4, calories: 380, protein_g: 13 } },
    ]),
    sat_fat_g: 1,
    soluble_fiber_g: 3,
    calories: 304,
    protein_g: 10,
    plant_pct: 100,
    notes: null,
    caption: null,
    meal_vibe: "plant-forward plate",
    ...overrides,
  };
}

describe("filterRecentMeals", () => {
  const oats = meal({ caption: "morning oats", meal_vibe: "fiber-friendly snack" });
  const chicken = meal({
    caption: null,
    meal_vibe: "protein-forward plate",
    items_json: JSON.stringify([
      { name: "Chicken breast", grams: 200, confidence: "high", is_plant: false, per_100g: { sat_fat_g: 1, soluble_fiber_g: 0, calories: 165, protein_g: 31 } },
    ]),
  });
  const list = [oats, chicken];

  it("returns everything for an empty query", () => {
    expect(filterRecentMeals(list, "")).toEqual(list);
    expect(filterRecentMeals(list, "   ")).toEqual(list);
  });

  it("matches on caption", () => {
    expect(filterRecentMeals(list, "morning")).toEqual([oats]);
  });

  it("matches on vibe", () => {
    expect(filterRecentMeals(list, "protein")).toEqual([chicken]);
  });

  it("matches on item names", () => {
    expect(filterRecentMeals(list, "chicken")).toEqual([chicken]);
  });

  it("is case-insensitive", () => {
    expect(filterRecentMeals(list, "OATS")).toEqual([oats]);
  });

  it("requires every term to match (AND search)", () => {
    expect(filterRecentMeals(list, "morning oats")).toEqual([oats]);
    expect(filterRecentMeals(list, "morning chicken")).toEqual([]);
  });

  it("preserves input order (newest-first comes pre-sorted)", () => {
    expect(filterRecentMeals(list, "plate")).toEqual([chicken]);
  });
});

describe("recentMealLabel", () => {
  it("prefers the caption", () => {
    expect(recentMealLabel(meal({ caption: "lunch bowl" }))).toBe("lunch bowl");
  });

  it("falls back to the vibe", () => {
    expect(recentMealLabel(meal({ caption: null, meal_vibe: "veg-heavy plate" }))).toBe(
      "veg-heavy plate"
    );
  });

  it("falls back to a top-items summary", () => {
    const m = meal({
      caption: null,
      meal_vibe: null,
      items_json: JSON.stringify([
        { name: "Rice", grams: 200, confidence: "high", is_plant: true, per_100g: { sat_fat_g: 0, soluble_fiber_g: 1, calories: 130, protein_g: 3 } },
        { name: "Beans", grams: 100, confidence: "high", is_plant: true, per_100g: { sat_fat_g: 0, soluble_fiber_g: 6, calories: 120, protein_g: 8 } },
        { name: "Salsa", grams: 30, confidence: "high", is_plant: true, per_100g: { sat_fat_g: 0, soluble_fiber_g: 1, calories: 30, protein_g: 1 } },
      ]),
    });
    // Sorted by grams desc, top 2 named, rest counted.
    expect(recentMealLabel(m)).toBe("Rice, Beans +1");
  });

  it("degrades to a bare fallback when there's nothing", () => {
    expect(recentMealLabel(meal({ caption: null, meal_vibe: null, items_json: "[]" }))).toBe(
      "meal"
    );
  });
});
