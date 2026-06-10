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

export type DayTotals = {
  calories: number;
  protein_g: number;
  sat_fat_g: number;
  soluble_fiber_g: number;
  plant_pct: number; // mass-weighted average across all meals
};

// Default targets, calibrated to Diogo's phenotype.
// These are reference numbers, not gates.
export const DEFAULT_TARGETS = {
  sat_fat_g: 18,
  soluble_fiber_g: 10,
  calories: 2000,
  protein_g: 90,
} as const;

export type Targets = typeof DEFAULT_TARGETS;

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
