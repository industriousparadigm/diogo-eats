// Client-side mirror of the backend's totalsFromItems — same shapes,
// same rounding as the web app's lib/computeTotals.ts. Used during meal
// editing to give live totals as the user tweaks grams without
// round-tripping through the server until they save.

import type { Item } from "./types";
import { round1 } from "./types";

export type LiveTotals = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  plant_pct: number;
};

// The full nutrition picture for a meal's working item set — the headline
// metrics plus the silent-capture nutrients (fat / carbs / sugar / salt /
// alcohol). `present` flags which of the *optional* silent nutrients any
// item actually carries, so the detail panel can tell a real zero
// ("everything we summed for sugar came to 0.0g") apart from absence
// ("no item in this meal records sugar at all"). The four core nutrients
// + plant% are always part of the schema, so they're not in `present`.
export type Nutrition = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  sugar_g: number;
  salt_g: number;
  alcohol_g: number;
  plant_pct: number;
  present: {
    fat_g: boolean;
    carbs_g: boolean;
    sugar_g: boolean;
    salt_g: boolean;
    alcohol_g: boolean;
  };
};

// The one place the meal-edit portion math lives. Walks the items once,
// summing every tracked nutrient (skipping items / fields that are
// missing, exactly like the server's totalsFromItems) and recording which
// silent nutrients were present on at least one item.
export function computeNutrition(items: Item[]): Nutrition {
  let sat_fat_g = 0;
  let soluble_fiber_g = 0;
  let calories = 0;
  let protein_g = 0;
  let fat_g = 0;
  let carbs_g = 0;
  let sugar_g = 0;
  let salt_g = 0;
  let alcohol_g = 0;
  let plant_grams = 0;
  let total_grams = 0;
  const present = {
    fat_g: false,
    carbs_g: false,
    sugar_g: false,
    salt_g: false,
    alcohol_g: false,
  };
  for (const i of items) {
    if (!i.per_100g) continue;
    const f = i.grams / 100;
    const p = i.per_100g;
    sat_fat_g += p.sat_fat_g * f;
    soluble_fiber_g += p.soluble_fiber_g * f;
    calories += p.calories * f;
    protein_g += p.protein_g * f;
    if (typeof p.fat_g === "number") {
      fat_g += p.fat_g * f;
      present.fat_g = true;
    }
    if (typeof p.carbs_g === "number") {
      carbs_g += p.carbs_g * f;
      present.carbs_g = true;
    }
    if (typeof p.sugar_g === "number") {
      sugar_g += p.sugar_g * f;
      present.sugar_g = true;
    }
    if (typeof p.salt_g === "number") {
      salt_g += p.salt_g * f;
      present.salt_g = true;
    }
    if (typeof p.alcohol_g === "number") {
      alcohol_g += p.alcohol_g * f;
      present.alcohol_g = true;
    }
    total_grams += i.grams;
    if (i.is_plant) plant_grams += i.grams;
  }
  return {
    sat_fat_g: round1(sat_fat_g),
    soluble_fiber_g: round1(soluble_fiber_g),
    calories: Math.round(calories),
    protein_g: round1(protein_g),
    fat_g: round1(fat_g),
    carbs_g: round1(carbs_g),
    sugar_g: round1(sugar_g),
    salt_g: round1(salt_g),
    alcohol_g: round1(alcohol_g),
    plant_pct: total_grams > 0 ? Math.round((plant_grams / total_grams) * 100) : 0,
    present,
  };
}

// The lighter live-edit headline slice — five metrics for the sticky
// totals bar. Derived from the full computation so the portion math lives
// in exactly one place. Note the headline keeps sat fat / fiber UNROUNDED
// (the bar formats them itself to one decimal), so we recompute those two
// raw rather than reading the panel's rounded values.
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
