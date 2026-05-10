import { describe, it, expect } from "vitest";
import { isValidItem } from "../validate";

const validItem = {
  name: "rolled oats",
  grams: 50,
  confidence: "high",
  is_plant: true,
  per_100g: {
    sat_fat_g: 1.2,
    soluble_fiber_g: 4,
    calories: 380,
    protein_g: 13,
  },
};

describe("isValidItem", () => {
  it("accepts a well-formed item", () => {
    expect(isValidItem(validItem)).toBe(true);
  });

  describe("rejects basics", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["string", "oats"],
      ["number", 100],
      ["array", []],
    ])("rejects %s", (_, x) => {
      expect(isValidItem(x)).toBe(false);
    });
  });

  describe("name", () => {
    it("rejects empty string", () => {
      expect(isValidItem({ ...validItem, name: "" })).toBe(false);
    });
    it("rejects whitespace-only", () => {
      expect(isValidItem({ ...validItem, name: "   " })).toBe(false);
    });
    it("rejects non-string", () => {
      expect(isValidItem({ ...validItem, name: 123 })).toBe(false);
    });
  });

  describe("grams", () => {
    it("rejects negative", () => {
      expect(isValidItem({ ...validItem, grams: -1 })).toBe(false);
    });
    it("rejects above the 5kg cap (sanity bound)", () => {
      expect(isValidItem({ ...validItem, grams: 5001 })).toBe(false);
    });
    it("accepts boundary (exactly 5000)", () => {
      expect(isValidItem({ ...validItem, grams: 5000 })).toBe(true);
    });
    it("rejects NaN / Infinity", () => {
      expect(isValidItem({ ...validItem, grams: NaN })).toBe(false);
      expect(isValidItem({ ...validItem, grams: Infinity })).toBe(false);
    });
    it("rejects non-number", () => {
      expect(isValidItem({ ...validItem, grams: "50" })).toBe(false);
    });
  });

  describe("confidence", () => {
    it("only accepts 'low' | 'medium' | 'high'", () => {
      expect(isValidItem({ ...validItem, confidence: "guess" })).toBe(false);
      expect(isValidItem({ ...validItem, confidence: "" })).toBe(false);
      expect(isValidItem({ ...validItem, confidence: undefined })).toBe(false);
      expect(isValidItem({ ...validItem, confidence: "low" })).toBe(true);
      expect(isValidItem({ ...validItem, confidence: "medium" })).toBe(true);
      expect(isValidItem({ ...validItem, confidence: "high" })).toBe(true);
    });
  });

  describe("is_plant", () => {
    it("must be a real boolean (truthy values aren't enough)", () => {
      expect(isValidItem({ ...validItem, is_plant: 1 })).toBe(false);
      expect(isValidItem({ ...validItem, is_plant: "true" })).toBe(false);
      expect(isValidItem({ ...validItem, is_plant: false })).toBe(true);
    });
  });

  describe("per_100g", () => {
    it("rejects when missing", () => {
      const { per_100g, ...rest } = validItem;
      expect(isValidItem(rest)).toBe(false);
    });
    it("rejects when not an object", () => {
      expect(isValidItem({ ...validItem, per_100g: "lots" })).toBe(false);
    });
    it("rejects when a required nutrient is missing", () => {
      expect(
        isValidItem({
          ...validItem,
          per_100g: { sat_fat_g: 1, soluble_fiber_g: 2, calories: 100 }, // missing protein
        })
      ).toBe(false);
    });
    it("rejects negative nutrients", () => {
      expect(
        isValidItem({
          ...validItem,
          per_100g: { ...validItem.per_100g, calories: -10 },
        })
      ).toBe(false);
    });
    it("rejects implausibly-high nutrients (sanity bound 1000)", () => {
      expect(
        isValidItem({
          ...validItem,
          per_100g: { ...validItem.per_100g, calories: 9999 },
        })
      ).toBe(false);
    });
  });

  it("ignores unknown extra fields (forward compatibility)", () => {
    expect(
      isValidItem({
        ...validItem,
        someExtraField: "future feature",
      })
    ).toBe(true);
  });
});
