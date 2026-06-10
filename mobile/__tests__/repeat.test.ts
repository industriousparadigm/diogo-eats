// Unit tests for lib/repeat.ts — the deterministic repeat-scaling math.
// Must stay identical to the web's lib/repeat so a repeat reads the same
// on both clients and matches what the server persists.

import {
  repeatMeal,
  isValidRepeatScale,
  repeatCaption,
  REPEAT_SCALE_MIN,
  REPEAT_SCALE_MAX,
} from "../lib/repeat";
import type { Item } from "../lib/types";

function oats(grams = 100): Item {
  return {
    name: "Oats",
    grams,
    confidence: "high",
    is_plant: true,
    per_100g: { sat_fat_g: 1.2, soluble_fiber_g: 4, calories: 380, protein_g: 13 },
  };
}

describe("repeatMeal", () => {
  it("scales grams by the multiplier, leaving per_100g untouched", () => {
    const [it] = repeatMeal([oats(80)], 2);
    expect(it.grams).toBe(160);
    expect(it.per_100g.calories).toBe(380); // reference nutrition is unchanged
  });

  it("rounds grams to one decimal", () => {
    const [it] = repeatMeal([oats(33)], 0.5);
    expect(it.grams).toBe(16.5);
  });

  it("carries confidence and is_plant verbatim", () => {
    const src: Item = { ...oats(50), confidence: "low", is_plant: false };
    const [it] = repeatMeal([src], 1);
    expect(it.confidence).toBe("low");
    expect(it.is_plant).toBe(false);
  });

  it("1× is a faithful copy", () => {
    const src = [oats(120), { ...oats(40), name: "Banana" }];
    const out = repeatMeal(src, 1);
    expect(out.map((i) => i.grams)).toEqual([120, 40]);
    expect(out.map((i) => i.name)).toEqual(["Oats", "Banana"]);
  });
});

describe("isValidRepeatScale", () => {
  it("accepts the band endpoints and middle", () => {
    expect(isValidRepeatScale(REPEAT_SCALE_MIN)).toBe(true);
    expect(isValidRepeatScale(1)).toBe(true);
    expect(isValidRepeatScale(REPEAT_SCALE_MAX)).toBe(true);
  });

  it("rejects out-of-band, NaN, and non-numbers", () => {
    expect(isValidRepeatScale(0)).toBe(false);
    expect(isValidRepeatScale(0.05)).toBe(false);
    expect(isValidRepeatScale(6)).toBe(false);
    expect(isValidRepeatScale(NaN)).toBe(false);
    expect(isValidRepeatScale("1")).toBe(false);
    expect(isValidRepeatScale(null)).toBe(false);
  });
});

describe("repeatCaption", () => {
  it("prefers the source caption", () => {
    expect(repeatCaption("lunch bowl", "veg-heavy plate")).toBe("repeat of lunch bowl");
  });

  it("falls back to the vibe when there's no caption", () => {
    expect(repeatCaption(null, "veg-heavy plate")).toBe("repeat of veg-heavy plate");
  });

  it("degrades to a bare repeat rather than fabricating", () => {
    expect(repeatCaption(null, null)).toBe("repeat");
    expect(repeatCaption("   ", "")).toBe("repeat");
  });
});
