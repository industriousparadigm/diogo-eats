// Client-safe nutrition arithmetic + item shapes.
//
// This is the arithmetic heart of the app: totalsFromItems is the ONE
// place portion math lives — reuse it, never reimplement. It lived in
// lib/vision.ts, but that module instantiates the Anthropic SDK at import
// time, which throws in the browser. So the pure math + the Item/Per100g
// types moved here (no I/O, no SDK) and lib/vision.ts re-exports them for
// all the server callers that already import `from "@/lib/vision"`.

export type Per100g = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  // Silent-capture nutrients: stored but not currently surfaced in the UI.
  fat_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  salt_g?: number;
  // Pure ethanol grams per 100g of the as-served item. 0 for non-
  // alcoholic foods.
  alcohol_g?: number;
};

export type Item = {
  name: string;
  grams: number;
  confidence: "low" | "medium" | "high";
  is_plant: boolean;
  per_100g: Per100g;
};

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

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
    const f = i.grams / 100;
    const p = i.per_100g;
    sat_fat_g += p.sat_fat_g * f;
    soluble_fiber_g += p.soluble_fiber_g * f;
    calories += p.calories * f;
    protein_g += p.protein_g * f;
    // Silent-capture totals: skip if missing (older items pre-schema bump).
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
