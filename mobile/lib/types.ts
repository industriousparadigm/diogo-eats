// Shared types mirrored from the backend lib/types.ts.
// The mobile app is a pure consumer — it never writes schema, only reads.

export type Per100g = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  fat_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  salt_g?: number;
  alcohol_g?: number;
};

export type Item = {
  name: string;
  grams: number;
  confidence: "low" | "medium" | "high";
  is_plant: boolean;
  per_100g: Per100g;
};

export type Meal = {
  id: string;
  created_at: number; // ms epoch
  photo_filename: string | null;
  items_json: string; // JSON of Item[]
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  plant_pct: number;
  fat_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  salt_g?: number;
  alcohol_g?: number;
  notes: string | null;
  caption: string | null;
  meal_vibe: string | null;
};

// One day's aggregate from GET /api/stats — mirrors the backend shape.
export type DayAggregate = {
  date: string; // YYYY-MM-DD
  meal_count: number;
  plant_pct: number;
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  alcohol_g: number;
  kcal_burn: number | null;
};

export type DayTotals = {
  calories: number;
  protein_g: number;
  sat_fat_g: number;
  soluble_fiber_g: number;
  plant_pct: number; // mass-weighted average across all meals
};

// Default targets, calibrated to Diogo's phenotype.
// These are reference numbers, not gates.
export type Targets = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
};

export const DEFAULT_TARGETS: Targets = {
  sat_fat_g: 18,
  soluble_fiber_g: 10,
  calories: 2000,
  protein_g: 90,
};

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Full per-item nutrition arithmetic — the native mirror of the web's
// lib/totals.ts (totalsFromItems). One place portion math lives for the
// composer and any other items→totals consumer; computeTotals (editTotals)
// stays the lighter live-edit variant and computeDayTotals sums whole
// meals. Same rounding the server persists, so previews match what saves.
export function totalsFromItems(items: Item[]) {
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
  for (const i of items) {
    if (!i.per_100g) continue;
    const f = i.grams / 100;
    const p = i.per_100g;
    sat_fat_g += p.sat_fat_g * f;
    soluble_fiber_g += p.soluble_fiber_g * f;
    calories += p.calories * f;
    protein_g += p.protein_g * f;
    if (typeof p.fat_g === "number") fat_g += p.fat_g * f;
    if (typeof p.carbs_g === "number") carbs_g += p.carbs_g * f;
    if (typeof p.sugar_g === "number") sugar_g += p.sugar_g * f;
    if (typeof p.salt_g === "number") salt_g += p.salt_g * f;
    if (typeof p.alcohol_g === "number") alcohol_g += p.alcohol_g * f;
    total_grams += i.grams;
    if (i.is_plant) plant_grams += i.grams;
  }
  const plant_pct = total_grams > 0 ? Math.round((plant_grams / total_grams) * 100) : 0;
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
    plant_pct,
  };
}

// Parse items_json safely — returns empty array on any failure.
export function parseItems(items_json: string): Item[] {
  try {
    const parsed = JSON.parse(items_json);
    return Array.isArray(parsed) ? (parsed as Item[]) : [];
  } catch {
    return [];
  }
}

// Sum day totals across an array of meals.
export function computeDayTotals(meals: Meal[]): DayTotals {
  if (meals.length === 0) {
    return { calories: 0, protein_g: 0, sat_fat_g: 0, soluble_fiber_g: 0, plant_pct: 0 };
  }

  let totalCalories = 0;
  let totalProtein = 0;
  let totalSatFat = 0;
  let totalFiber = 0;
  let totalGrams = 0;
  let plantGrams = 0;

  for (const meal of meals) {
    totalCalories += meal.calories;
    totalProtein += meal.protein_g;
    totalSatFat += meal.sat_fat_g;
    totalFiber += meal.soluble_fiber_g;

    // Re-derive plant% from items so it's accurate
    const items = parseItems(meal.items_json);
    for (const item of items) {
      totalGrams += item.grams;
      if (item.is_plant) plantGrams += item.grams;
    }
  }

  const plant_pct = totalGrams > 0 ? (plantGrams / totalGrams) * 100 : 0;

  return {
    calories: Math.round(totalCalories),
    protein_g: Math.round(totalProtein * 10) / 10,
    sat_fat_g: Math.round(totalSatFat * 10) / 10,
    soluble_fiber_g: Math.round(totalFiber * 10) / 10,
    plant_pct: Math.round(plant_pct),
  };
}
