// Unit tests for lib/compose.ts — the composer's item-building + the
// rule-based vibe. Must match the web's lib/compose so a composed meal
// reads identically and the preview equals what the server saves.

import { composeItems, composeVibe, type ResolvedFood } from "../lib/compose";
import type { Per100g } from "../lib/types";

const OATS: Per100g = { sat_fat_g: 1.2, soluble_fiber_g: 4, calories: 380, protein_g: 13 };
const BUTTER: Per100g = { sat_fat_g: 51, soluble_fiber_g: 0, calories: 717, protein_g: 1 };
const CHICKEN: Per100g = { sat_fat_g: 1, soluble_fiber_g: 0, calories: 165, protein_g: 31 };

function resolved(map: Record<string, { name: string; is_plant: boolean; per_100g: Per100g }>) {
  const m = new Map<string, ResolvedFood>();
  for (const [id, v] of Object.entries(map)) m.set(id, { food_id: id, ...v });
  return m;
}

describe("composeItems", () => {
  it("builds items with confidence high and library numbers verbatim", () => {
    const m = resolved({ oats: { name: "Oats", is_plant: true, per_100g: OATS } });
    const items = composeItems([{ food_id: "oats", grams: 80 }], m);
    expect(items).toEqual([
      { name: "Oats", grams: 80, confidence: "high", is_plant: true, per_100g: OATS },
    ]);
  });

  it("rounds grams to one decimal", () => {
    const m = resolved({ oats: { name: "Oats", is_plant: true, per_100g: OATS } });
    const [it] = composeItems([{ food_id: "oats", grams: 33.33 }], m);
    expect(it.grams).toBe(33.3);
  });

  it("throws on an unresolved food_id", () => {
    expect(() => composeItems([{ food_id: "ghost", grams: 50 }], new Map())).toThrow(
      /unresolved food_id/
    );
  });
});

describe("composeVibe", () => {
  function items(lines: Array<[string, boolean, Per100g, number]>) {
    return lines.map(([name, is_plant, per_100g, grams]) => ({
      name,
      grams,
      confidence: "high" as const,
      is_plant,
      per_100g,
    }));
  }

  it("empty plate for no items", () => {
    expect(composeVibe([])).toBe("empty plate");
  });

  it("flags a genuinely fat-dominant plate", () => {
    // 30g butter = 15.3g sat fat, 0% plant.
    expect(composeVibe(items([["butter", false, BUTTER, 30]]))).toBe("fat-heavy treat");
  });

  it("small fiber-y plant snack", () => {
    // 40g oats: 1.6g fiber, 100% plant, ≤80g.
    expect(composeVibe(items([["oats", true, OATS, 40]]))).toBe("fiber-friendly snack");
  });

  it("plant-led, fiber-rich for a big high-fiber plant plate", () => {
    // 200g oats: 8g fiber, 100% plant.
    expect(composeVibe(items([["oats", true, OATS, 200]]))).toBe("plant-led, fiber-rich");
  });

  it("protein-forward plate when low plant share", () => {
    // 200g chicken: 0% plant, low fiber, low sat.
    expect(composeVibe(items([["chicken", false, CHICKEN, 200]]))).toBe(
      "protein-forward plate"
    );
  });

  it("balanced plate in the middle plant band", () => {
    // 100g oats (plant) + 150g chicken (not) → 40% plant.
    expect(
      composeVibe(items([["oats", true, OATS, 100], ["chicken", false, CHICKEN, 150]]))
    ).toBe("balanced plate");
  });
});
