import { describe, it, expect } from "vitest";
import { composeItems, composeVibe, type ResolvedFood } from "../compose";
import { totalsFromItems, type Item } from "../vision";

function resolved(
  id: string,
  name: string,
  is_plant: boolean,
  per: Partial<ResolvedFood["per_100g"]>
): ResolvedFood {
  return {
    food_id: id,
    name,
    is_plant,
    per_100g: { sat_fat_g: 0, soluble_fiber_g: 0, calories: 0, protein_g: 0, ...per },
  };
}

const oats = resolved("oats", "rolled oats", true, { sat_fat_g: 1.2, soluble_fiber_g: 4, calories: 380, protein_g: 13 });
const banana = resolved("banana", "banana", true, { sat_fat_g: 0.1, soluble_fiber_g: 0.6, calories: 89, protein_g: 1.1 });
const butter = resolved("butter", "butter", false, { sat_fat_g: 51, soluble_fiber_g: 0, calories: 717, protein_g: 0.9 });
const chicken = resolved("chicken", "chicken breast, cooked", false, { sat_fat_g: 1.1, soluble_fiber_g: 0, calories: 165, protein_g: 31 });

function mapOf(...foods: ResolvedFood[]) {
  return new Map(foods.map((f) => [f.food_id, f]));
}

describe("composeItems — build items from library foods", () => {
  it("maps each line to an item with library data + confidence high", () => {
    const items = composeItems(
      [
        { food_id: "oats", grams: 50 },
        { food_id: "banana", grams: 110 },
      ],
      mapOf(oats, banana)
    );
    expect(items).toEqual<Item[]>([
      { name: "rolled oats", grams: 50, confidence: "high", is_plant: true, per_100g: oats.per_100g },
      { name: "banana", grams: 110, confidence: "high", is_plant: true, per_100g: banana.per_100g },
    ]);
  });

  it("rounds grams to one decimal", () => {
    const items = composeItems([{ food_id: "oats", grams: 33.33 }], mapOf(oats));
    expect(items[0].grams).toBe(33.3);
  });

  it("throws on an unresolved food_id (the route validates first, this is the guard)", () => {
    expect(() => composeItems([{ food_id: "ghost", grams: 10 }], mapOf(oats))).toThrow(/ghost/);
  });

  it("totals match totalsFromItems over the composed items", () => {
    const items = composeItems(
      [
        { food_id: "oats", grams: 50 },
        { food_id: "banana", grams: 110 },
      ],
      mapOf(oats, banana)
    );
    const t = totalsFromItems(items);
    // 50g oats (190 kcal) + 110g banana (97.9 kcal) ≈ 288; plant 100%.
    expect(t.calories).toBe(Math.round(380 * 0.5 + 89 * 1.1));
    expect(t.plant_pct).toBe(100);
  });
});

describe("composeVibe — rule-based, no LLM", () => {
  function items(...lines: [ResolvedFood, number][]): Item[] {
    return composeItems(
      lines.map(([f, g]) => ({ food_id: f.food_id, grams: g })),
      mapOf(...lines.map(([f]) => f))
    );
  }

  it("empty plate for no items", () => {
    expect(composeVibe([])).toBe("empty plate");
  });

  it("plant-led, fiber-rich when ~all plant + good fiber", () => {
    // 80g oats (3.2g sol fiber) + 120g banana → ~100% plant, fiber ~3.9; bump oats.
    expect(composeVibe(items([oats, 120], [banana, 120]))).toBe("plant-led, fiber-rich");
  });

  it("plant-forward plate when ~all plant but low fiber", () => {
    const lowFiber = resolved("rice", "white rice", true, { calories: 130, protein_g: 2 });
    expect(composeVibe(items([lowFiber, 200]))).toBe("plant-forward plate");
  });

  it("veg-heavy plate when mostly but not all plant", () => {
    // 200g oats+banana plant, 60g chicken non-plant → ~77% plant.
    const v = composeVibe(items([oats, 100], [banana, 100], [chicken, 60]));
    expect(["veg-heavy plate", "veg-heavy, fiber-rich"]).toContain(v);
  });

  it("balanced plate around half-and-half", () => {
    // 100g banana plant + 100g chicken non-plant → 50% plant, low fiber.
    expect(composeVibe(items([banana, 100], [chicken, 100]))).toBe("balanced plate");
  });

  it("protein-forward plate when mostly non-plant", () => {
    expect(composeVibe(items([chicken, 200], [banana, 30]))).toBe("protein-forward plate");
  });

  it("small snack for a tiny plain portion", () => {
    const cracker = resolved("cracker", "cracker", true, { calories: 400, protein_g: 8, soluble_fiber_g: 0.2 });
    expect(composeVibe(items([cracker, 20]))).toBe("small snack");
  });

  it("fiber-friendly snack for a tiny plant+fiber portion", () => {
    expect(composeVibe(items([oats, 40]))).toBe("fiber-friendly snack");
  });

  it("fat-heavy treat only when sat fat truly dominates a non-plant plate", () => {
    // 100g butter: 51g sat fat, 0% plant.
    expect(composeVibe(items([butter, 100]))).toBe("fat-heavy treat");
  });

  it("a pat of butter on an oat bowl does NOT trigger fat-heavy treat", () => {
    const v = composeVibe(items([oats, 120], [banana, 120], [butter, 8]));
    expect(v).not.toBe("fat-heavy treat");
  });
});
