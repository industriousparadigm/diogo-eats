import { describe, it, expect } from "vitest";
import {
  isValidPer100g,
  isProvenance,
  provenanceLabel,
  isUsableLabel,
  PROVENANCE_VALUES,
} from "../foods";
import { rankFoodsForPrompt, type FoodMemory } from "../db";
import { LABEL_SYSTEM } from "../vision";

function food(over: Partial<FoodMemory> = {}): FoodMemory {
  return {
    name_key: over.name_key ?? "x",
    display_name: over.display_name ?? "X",
    is_plant: over.is_plant ?? 1,
    per_100g_json: over.per_100g_json ?? "{}",
    times_seen: over.times_seen ?? 1,
    last_seen: over.last_seen ?? 0,
    provenance: over.provenance ?? "ai_inferred",
    portion_presets: over.portion_presets ?? null,
  };
}

describe("isValidPer100g", () => {
  it("accepts a full valid object", () => {
    expect(
      isValidPer100g({ sat_fat_g: 1, soluble_fiber_g: 0.5, calories: 120, protein_g: 3 })
    ).toBe(true);
  });
  it("accepts optional silent-capture nutrients in range", () => {
    expect(
      isValidPer100g({ sat_fat_g: 1, soluble_fiber_g: 0, calories: 50, protein_g: 1, fat_g: 2, salt_g: 0.5 })
    ).toBe(true);
  });
  it("rejects missing required fields", () => {
    expect(isValidPer100g({ sat_fat_g: 1, calories: 50, protein_g: 1 })).toBe(false);
  });
  it("rejects out-of-range, non-finite, non-number values", () => {
    expect(isValidPer100g({ sat_fat_g: -1, soluble_fiber_g: 0, calories: 50, protein_g: 1 })).toBe(false);
    expect(isValidPer100g({ sat_fat_g: 1, soluble_fiber_g: 0, calories: 2000, protein_g: 1 })).toBe(false);
    expect(isValidPer100g({ sat_fat_g: NaN, soluble_fiber_g: 0, calories: 50, protein_g: 1 })).toBe(false);
    expect(isValidPer100g("nope")).toBe(false);
    expect(isValidPer100g(null)).toBe(false);
  });
  it("rejects an out-of-range optional field", () => {
    expect(
      isValidPer100g({ sat_fat_g: 1, soluble_fiber_g: 0, calories: 50, protein_g: 1, salt_g: 9999 })
    ).toBe(false);
  });
});

describe("provenance helpers", () => {
  it("isProvenance only accepts the three values", () => {
    for (const v of PROVENANCE_VALUES) expect(isProvenance(v)).toBe(true);
    expect(isProvenance("guessed")).toBe(false);
    expect(isProvenance(1)).toBe(false);
  });
  it("provenanceLabel is plain language, no codes", () => {
    expect(provenanceLabel("label_verified")).toBe("from label");
    expect(provenanceLabel("user_corrected")).toBe("you confirmed");
    expect(provenanceLabel("ai_inferred")).toBe("ai guess");
  });
});

describe("rankFoodsForPrompt — provenance first, then times_seen", () => {
  it("orders label_verified before user_corrected before ai_inferred", () => {
    const rows = [
      food({ name_key: "ai", provenance: "ai_inferred", times_seen: 99 }),
      food({ name_key: "label", provenance: "label_verified", times_seen: 1 }),
      food({ name_key: "user", provenance: "user_corrected", times_seen: 1 }),
    ];
    expect(rankFoodsForPrompt(rows).map((f) => f.name_key)).toEqual(["label", "user", "ai"]);
  });
  it("within a tier, higher times_seen wins, then last_seen", () => {
    const rows = [
      food({ name_key: "a", provenance: "user_corrected", times_seen: 2, last_seen: 100 }),
      food({ name_key: "b", provenance: "user_corrected", times_seen: 5, last_seen: 50 }),
      food({ name_key: "c", provenance: "user_corrected", times_seen: 2, last_seen: 999 }),
    ];
    expect(rankFoodsForPrompt(rows).map((f) => f.name_key)).toEqual(["b", "c", "a"]);
  });
  it("a high-times_seen ai_inferred still ranks below any validated entry", () => {
    const rows = [
      food({ name_key: "ai", provenance: "ai_inferred", times_seen: 1000 }),
      food({ name_key: "user", provenance: "user_corrected", times_seen: 1 }),
    ];
    expect(rankFoodsForPrompt(rows)[0].name_key).toBe("user");
  });
  it("does not mutate the input array", () => {
    const rows = [food({ name_key: "a", provenance: "ai_inferred" }), food({ name_key: "b", provenance: "label_verified" })];
    const before = rows.map((r) => r.name_key);
    rankFoodsForPrompt(rows);
    expect(rows.map((r) => r.name_key)).toEqual(before);
  });
});

describe("isUsableLabel — reject the prompt's 'unreadable' sentinel", () => {
  const zero = { sat_fat_g: 0, soluble_fiber_g: 0, calories: 0, protein_g: 0 };
  it("rejects the all-zero unreadable sentinel", () => {
    expect(isUsableLabel(zero, "unreadable label")).toBe(false);
  });
  it("rejects an empty name", () => {
    expect(isUsableLabel({ ...zero, calories: 120 }, "")).toBe(false);
  });
  it("accepts a real label with any macro present", () => {
    expect(isUsableLabel({ ...zero, calories: 350 }, "Chocapic cereal")).toBe(true);
    expect(isUsableLabel({ ...zero, protein_g: 8 }, "tofu")).toBe(true);
  });
});

describe("LABEL_SYSTEM prompt invariants", () => {
  it("forbids estimating — read off the panel", () => {
    expect(LABEL_SYSTEM).toContain("Do NOT estimate");
  });
  it("normalizes to per 100 grams", () => {
    expect(LABEL_SYSTEM).toContain("per 100 GRAMS");
  });
  it("carries the sodium→salt conversion rule", () => {
    expect(LABEL_SYSTEM).toContain("sodium_mg × 2.5 ÷ 1000");
  });
  it("defines the unreadable-label fallback so the caller can reject it", () => {
    expect(LABEL_SYSTEM).toContain("unreadable label");
  });
});
