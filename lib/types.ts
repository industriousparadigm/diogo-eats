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

// Daily targets — reference numbers, not gates. Calibrated to Diogo's
// specific phenotype (HDL 75, trigs 71, A1c 5.5 — metabolically clean
// but with a strong genetic LDL signal from family history). 18g sat fat
// is more livable than the 13g textbook cap and respects that for him,
// dietary sat fat is one lever among several, not the whole game.
// Soluble fiber is arguably the more important lever — directly binds
// bile acids, forces hepatic cholesterol turnover.
export const TARGETS = {
  sat_fat_g: 18,
  soluble_fiber_g: 10,
  calories: 2000,
  protein_g: 90,
};

// Diogo's anchor: cardiology retest with Sergio Machado Leite.
// Used by the looking-back surface to show "X weeks to retest" gently.
// Update this if the appointment moves.
export const RETEST_DATE = "2026-09-15";
