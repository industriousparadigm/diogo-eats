// Pure helpers for the composer lane (build a meal from known foods, zero
// AI). Ported from the web's lib/compose.ts. The vibe rule reads exactly
// the same so a composed meal reads identically across clients. composeItems
// is the local mirror of what POST /api/meals/compose builds server-side,
// used to drive the live preview so what the user sees is what saves.

import { totalsFromItems, type Item, type Per100g } from "./types";

// One requested line: a library food id + how many grams of it.
export type ComposeLine = { food_id: string; grams: number };

// A library food, resolved (name + plant flag + per_100g).
export type ResolvedFood = {
  food_id: string;
  name: string;
  is_plant: boolean;
  per_100g: Per100g;
};

// Build the items array from resolved foods + requested grams. confidence
// is always "high" — these are user-validated library numbers, not a
// Vision guess. Grams rounded to 1 decimal to match the rest of the app.
export function composeItems(
  lines: ComposeLine[],
  resolved: Map<string, ResolvedFood>
): Item[] {
  return lines.map((line) => {
    const food = resolved.get(line.food_id);
    if (!food) throw new Error(`unresolved food_id: ${line.food_id}`);
    return {
      name: food.name,
      grams: Math.round(line.grams * 10) / 10,
      confidence: "high",
      is_plant: food.is_plant,
      per_100g: food.per_100g,
    };
  });
}

// Rule-based meal vibe — no LLM. Plant share by mass + soluble fiber +
// saturated-fat density decide a short (≤6-word) phrase from the existing
// vibe vocabulary so a composed meal reads the same as a parsed one.
export function composeVibe(items: Item[]): string {
  if (items.length === 0) return "empty plate";

  const totals = totalsFromItems(items);
  const totalGrams = items.reduce((s, i) => s + i.grams, 0);
  const plantPct = totals.plant_pct; // mass-weighted 0-100
  const fiber = totals.soluble_fiber_g;
  const satFat = totals.sat_fat_g;
  const isSmall = totalGrams > 0 && totalGrams <= 80;

  if (satFat >= 12 && plantPct < 40) return "fat-heavy treat";

  if (isSmall) {
    if (plantPct >= 70 && fiber >= 1.5) return "fiber-friendly snack";
    return "small snack";
  }

  if (plantPct >= 90) {
    return fiber >= 4 ? "plant-led, fiber-rich" : "plant-forward plate";
  }
  if (plantPct >= 60) {
    return fiber >= 4 ? "veg-heavy, fiber-rich" : "veg-heavy plate";
  }
  if (plantPct >= 35) return "balanced plate";
  return "protein-forward plate";
}
