// Shared client-side types. The server uses lib/db.ts and lib/vision.ts —
// these re-export the shapes the client cares about so we don't duplicate.

export type Per100g = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  fat_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  salt_g?: number;
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
  created_at: number;
  photo_filename: string | null;
  items_json: string;
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  plant_pct: number;
  fat_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  salt_g?: number;
  notes: string | null;
  caption: string | null;
  meal_vibe: string | null;
};

export type DayAggregate = {
  date: string;
  meal_count: number;
  plant_pct: number;
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
};

// Daily targets — the dashboard's only "should" numbers. Tuned to Diogo's
// stated lifestyle plan: ESC suggests <13g sat fat for moderate-risk men;
// soluble fiber 10g+ helps LDL; protein for the strength-training goal.
export const TARGETS = {
  sat_fat_g: 13,
  soluble_fiber_g: 10,
  calories: 2000,
  protein_g: 90,
};

// Diogo's anchor: cardiology retest with Sergio Machado Leite.
// Used by the looking-back surface to show "X weeks to retest" gently.
// Update this if the appointment moves.
export const RETEST_DATE = "2026-09-15";
