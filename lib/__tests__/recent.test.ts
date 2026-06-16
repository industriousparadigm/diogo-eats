import { describe, it, expect } from "vitest";
import {
  parseRecentParams,
  recentSinceMs,
  mealIdentityKey,
  dedupeRecentMeals,
  RECENT_DEFAULT_DAYS,
  RECENT_DEFAULT_LIMIT,
  RECENT_MAX_DAYS,
  RECENT_MAX_LIMIT,
} from "../recent";
import { tzDayStart } from "../tz";

function params(qs: string): URLSearchParams {
  return new URL(`https://x/api/meals/recent${qs}`).searchParams;
}

const m = (over: Record<string, unknown> = {}) => ({
  id: "x",
  caption: null,
  meal_vibe: null,
  items_json: "[]",
  ...over,
});

describe("parseRecentParams", () => {
  it("defaults when params are absent", () => {
    expect(parseRecentParams(params(""))).toEqual({
      days: RECENT_DEFAULT_DAYS,
      limit: RECENT_DEFAULT_LIMIT,
    });
  });

  it("reads explicit values", () => {
    expect(parseRecentParams(params("?days=7&limit=20"))).toEqual({
      days: 7,
      limit: 20,
    });
  });

  it("clamps days to [1, max]", () => {
    expect(parseRecentParams(params("?days=0")).days).toBe(1);
    expect(parseRecentParams(params("?days=999")).days).toBe(RECENT_MAX_DAYS);
  });

  it("clamps limit to [1, max]", () => {
    expect(parseRecentParams(params("?limit=0")).limit).toBe(1);
    expect(parseRecentParams(params("?limit=9999")).limit).toBe(RECENT_MAX_LIMIT);
  });

  it("falls back to defaults on garbage", () => {
    const r = parseRecentParams(params("?days=abc&limit=xyz"));
    expect(r.days).toBe(RECENT_DEFAULT_DAYS);
    expect(r.limit).toBe(RECENT_DEFAULT_LIMIT);
  });
});

describe("recentSinceMs", () => {
  // Fixed clock: 2026-06-10 12:00 Lisbon (summer, UTC+1).
  const now = Date.UTC(2026, 5, 10, 11, 0);

  it("days=1 is the start of today in the app tz", () => {
    expect(recentSinceMs(1, undefined, now)).toBe(tzDayStart("2026-06-10"));
  });

  it("days=14 reaches back to the start of the 14th-most-recent day", () => {
    // today + 13 prior days → first day is 2026-05-28.
    expect(recentSinceMs(14, undefined, now)).toBe(tzDayStart("2026-05-28"));
  });

  it("the window lower bound precedes now", () => {
    expect(recentSinceMs(14, undefined, now)).toBeLessThan(now);
  });
});

describe("mealIdentityKey", () => {
  it("matches a meal and a (legacy) repeat of it to the same key", () => {
    const orig = mealIdentityKey(m({ caption: "organic india psyllium" }));
    const rep = mealIdentityKey(m({ caption: "repeat of organic india psyllium" }));
    const repRep = mealIdentityKey(m({ caption: "repeat of repeat of organic india psyllium" }));
    expect(rep).toBe(orig);
    expect(repRep).toBe(orig);
  });
  it("is case/whitespace-insensitive on the caption", () => {
    expect(mealIdentityKey(m({ caption: "  Organic   India " }))).toBe(
      mealIdentityKey(m({ caption: "organic india" }))
    );
  });
  it("falls back caption → vibe → items → id", () => {
    expect(mealIdentityKey(m({ meal_vibe: "oat milk coffee" }))).toBe("vibe:oat milk coffee");
    expect(
      mealIdentityKey(m({ items_json: JSON.stringify([{ name: "Oats" }, { name: "Milk" }]) }))
    ).toBe("items:milk|oats");
    expect(mealIdentityKey(m({ id: "abc" }))).toBe("id:abc");
  });
});

describe("dedupeRecentMeals", () => {
  it("keeps the newest occurrence of each food and caps to limit", () => {
    // newest-first input: a fresh repeat, then the original, then a distinct food
    const meals = [
      m({ id: "new", caption: "repeat of psyllium" }),
      m({ id: "old", caption: "psyllium" }),
      m({ id: "coffee", caption: "coffee" }),
    ];
    const out = dedupeRecentMeals(meals, 10);
    expect(out.map((x) => x.id)).toEqual(["new", "coffee"]); // psyllium collapses to the newest
  });
  it("respects the limit", () => {
    const meals = [m({ id: "a", caption: "a" }), m({ id: "b", caption: "b" }), m({ id: "c", caption: "c" })];
    expect(dedupeRecentMeals(meals, 2).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
