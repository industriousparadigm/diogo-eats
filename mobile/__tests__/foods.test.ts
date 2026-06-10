// Unit tests for lib/foods.ts — per_100g validation, provenance labels,
// and the per_100g_json parser. Mirrors the web's lib/foods rules.

import {
  isValidPer100g,
  isProvenance,
  provenanceLabel,
  parsePer100g,
} from "../lib/foods";

describe("isValidPer100g", () => {
  const ok = { sat_fat_g: 2, soluble_fiber_g: 4, calories: 380, protein_g: 13 };

  it("accepts a complete required set in range", () => {
    expect(isValidPer100g(ok)).toBe(true);
  });

  it("accepts optional silent-capture nutrients in range", () => {
    expect(isValidPer100g({ ...ok, fat_g: 10, carbs_g: 60, alcohol_g: 0 })).toBe(true);
  });

  it("rejects a missing required nutrient", () => {
    const { calories, ...rest } = ok;
    expect(isValidPer100g(rest)).toBe(false);
  });

  it("rejects out-of-range, negative, and non-numeric values", () => {
    expect(isValidPer100g({ ...ok, calories: 1001 })).toBe(false);
    expect(isValidPer100g({ ...ok, sat_fat_g: -1 })).toBe(false);
    expect(isValidPer100g({ ...ok, protein_g: "13" })).toBe(false);
    expect(isValidPer100g({ ...ok, calories: NaN })).toBe(false);
  });

  it("rejects an out-of-range optional nutrient", () => {
    expect(isValidPer100g({ ...ok, fat_g: 5000 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidPer100g(null)).toBe(false);
    expect(isValidPer100g("x")).toBe(false);
  });
});

describe("isProvenance / provenanceLabel", () => {
  it("recognises the three provenance values", () => {
    expect(isProvenance("label_verified")).toBe(true);
    expect(isProvenance("user_corrected")).toBe(true);
    expect(isProvenance("ai_inferred")).toBe(true);
    expect(isProvenance("guess")).toBe(false);
  });

  it("renders plain-language labels (no codes)", () => {
    expect(provenanceLabel("label_verified")).toBe("from label");
    expect(provenanceLabel("user_corrected")).toBe("you confirmed");
    expect(provenanceLabel("ai_inferred")).toBe("ai guess");
  });
});

describe("parsePer100g", () => {
  it("parses valid JSON", () => {
    const p = parsePer100g('{"sat_fat_g":2,"soluble_fiber_g":4,"calories":380,"protein_g":13}');
    expect(p.calories).toBe(380);
  });

  it("falls back to zeroes on garbage", () => {
    expect(parsePer100g("not json")).toEqual({
      sat_fat_g: 0,
      soluble_fiber_g: 0,
      calories: 0,
      protein_g: 0,
    });
  });
});
