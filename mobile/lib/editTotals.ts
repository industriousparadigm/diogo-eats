// Client-side mirror of the backend's totalsFromItems — same shapes,
// same rounding as the web app's lib/computeTotals.ts. Used during meal
// editing to give live totals as the user tweaks grams without
// round-tripping through the server until they save.

import type { Item } from "./types";

export type LiveTotals = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  plant_pct: number;
};

export function computeTotals(items: Item[]): LiveTotals {
  let sat_fat_g = 0;
  let soluble_fiber_g = 0;
  let calories = 0;
  let protein_g = 0;
  let plant_grams = 0;
  let total_grams = 0;
  for (const i of items) {
    if (!i.per_100g) continue;
    const f = i.grams / 100;
    sat_fat_g += i.per_100g.sat_fat_g * f;
    soluble_fiber_g += i.per_100g.soluble_fiber_g * f;
    calories += i.per_100g.calories * f;
    protein_g += i.per_100g.protein_g * f;
    total_grams += i.grams;
    if (i.is_plant) plant_grams += i.grams;
  }
  return {
    sat_fat_g,
    soluble_fiber_g,
    calories,
    protein_g,
    plant_pct: total_grams > 0 ? Math.round((plant_grams / total_grams) * 100) : 0,
  };
}
