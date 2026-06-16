import { describe, it, expect } from "vitest";
import {
  isValidRepeatScale,
  repeatCaption,
  repeatMeal,
  stripRepeatPrefix,
  REPEAT_SCALE_MIN,
  REPEAT_SCALE_MAX,
} from "../repeat";
import { totalsFromItems, type Item } from "../vision";
import { createdAtForTz, tzYmd } from "../tz";

const oats: Item = {
  name: "rolled oats",
  grams: 50,
  confidence: "high",
  is_plant: true,
  per_100g: { sat_fat_g: 1.2, soluble_fiber_g: 4, calories: 380, protein_g: 13 },
};
const butter: Item = {
  name: "butter",
  grams: 12,
  confidence: "low",
  is_plant: false,
  per_100g: {
    sat_fat_g: 51,
    soluble_fiber_g: 0,
    calories: 717,
    protein_g: 0.9,
    fat_g: 81,
    carbs_g: 0,
    sugar_g: 0,
    salt_g: 0.1,
  },
};

describe("repeatMeal — scaling math", () => {
  it("1x copies grams verbatim", () => {
    const out = repeatMeal([oats, butter], 1);
    expect(out.map((i) => i.grams)).toEqual([50, 12]);
  });

  it("scales every item's grams by the multiplier", () => {
    const out = repeatMeal([oats, butter], 2);
    expect(out.map((i) => i.grams)).toEqual([100, 24]);
    const half = repeatMeal([oats, butter], 0.5);
    expect(half.map((i) => i.grams)).toEqual([25, 6]);
  });

  it("rounds scaled grams to one decimal (no float drift)", () => {
    const item: Item = { ...oats, grams: 33 };
    // 33 * 0.1 = 3.3 exactly; 33 * 1.5 = 49.5
    expect(repeatMeal([item], 0.1)[0].grams).toBe(3.3);
    expect(repeatMeal([item], 1.5)[0].grams).toBe(49.5);
  });

  it("leaves per_100g, is_plant, and confidence untouched", () => {
    const out = repeatMeal([oats, butter], 3);
    expect(out[0].per_100g).toEqual(oats.per_100g);
    expect(out[1].per_100g).toEqual(butter.per_100g);
    expect(out[0].is_plant).toBe(true);
    expect(out[1].is_plant).toBe(false);
    expect(out[1].confidence).toBe("low");
  });

  it("recomputed totals scale linearly with the multiplier", () => {
    const base = totalsFromItems(repeatMeal([oats, butter], 1));
    const doubled = totalsFromItems(repeatMeal([oats, butter], 2));
    // Calories double (within rounding); plant_pct is mass-ratio so unchanged.
    expect(doubled.calories).toBe(base.calories * 2);
    expect(doubled.plant_pct).toBe(base.plant_pct);
  });

  it("produces a fresh array, not the source references", () => {
    const src = [oats];
    const out = repeatMeal(src, 1);
    expect(out[0]).not.toBe(src[0]);
    out[0].grams = 999;
    expect(src[0].grams).toBe(50); // source unmutated
  });

  it("emits exactly the 5 item fields the schema validates — no photo, no id leak", () => {
    const out = repeatMeal([oats], 1)[0];
    expect(Object.keys(out).sort()).toEqual(
      ["confidence", "grams", "is_plant", "name", "per_100g"].sort()
    );
  });
});

describe("isValidRepeatScale", () => {
  it("accepts the in-band values the UI offers", () => {
    for (const s of [0.5, 1, 2]) expect(isValidRepeatScale(s)).toBe(true);
  });
  it("accepts the boundary values", () => {
    expect(isValidRepeatScale(REPEAT_SCALE_MIN)).toBe(true);
    expect(isValidRepeatScale(REPEAT_SCALE_MAX)).toBe(true);
  });
  it("rejects out-of-band, non-finite, and non-number scales", () => {
    expect(isValidRepeatScale(0)).toBe(false);
    expect(isValidRepeatScale(0.05)).toBe(false);
    expect(isValidRepeatScale(5.1)).toBe(false);
    expect(isValidRepeatScale(-1)).toBe(false);
    expect(isValidRepeatScale(NaN)).toBe(false);
    expect(isValidRepeatScale(Infinity)).toBe(false);
    expect(isValidRepeatScale("2")).toBe(false);
    expect(isValidRepeatScale(null)).toBe(false);
  });
});

describe("stripRepeatPrefix", () => {
  it("peels one or many legacy 'repeat of ' prefixes", () => {
    expect(stripRepeatPrefix("organic india psyllium")).toBe("organic india psyllium");
    expect(stripRepeatPrefix("repeat of organic india psyllium")).toBe("organic india psyllium");
    expect(stripRepeatPrefix("repeat of repeat of organic india psyllium")).toBe(
      "organic india psyllium"
    );
    expect(stripRepeatPrefix(null)).toBe("");
    expect(stripRepeatPrefix("  Repeat Of  X ")).toBe("X");
  });
});

describe("repeatCaption — keeps identity, no 'repeat of' prefix", () => {
  it("returns the source caption verbatim (no prefix, no compounding)", () => {
    expect(repeatCaption("10 cashews", "small nut snack")).toBe("10 cashews");
    expect(repeatCaption("organic india psyllium", null)).toBe("organic india psyllium");
  });
  it("peels a legacy prefix so re-repeating cleans up instead of compounding", () => {
    expect(repeatCaption("repeat of organic india psyllium", null)).toBe(
      "organic india psyllium"
    );
    expect(repeatCaption("repeat of repeat of X", null)).toBe("X");
  });
  it("falls back to the (cleaned) vibe when there is no caption", () => {
    expect(repeatCaption(null, "oat milk coffee")).toBe("oat milk coffee");
  });
  it("returns null when both are empty — the copied vibe still shows", () => {
    expect(repeatCaption(null, null)).toBeNull();
    expect(repeatCaption("   ", "")).toBeNull();
    expect(repeatCaption(undefined, undefined)).toBeNull();
  });
});

describe("repeat date anchoring (createdAtForTz contract)", () => {
  // The route stamps created_at via createdAtForTz(for_date). These pin
  // the two behaviors the repeat flow relies on: a past for_date lands on
  // that calendar day in Lisbon; a missing for_date logs for "now".
  it("for_date in the past anchors the copy to that Lisbon day", () => {
    const ts = createdAtForTz("2026-06-01");
    expect(tzYmd(ts)).toBe("2026-06-01");
  });
  it("missing for_date logs for the current moment", () => {
    const now = Date.now();
    const ts = createdAtForTz(null, "Europe/Lisbon", now);
    expect(ts).toBe(now);
  });
});
