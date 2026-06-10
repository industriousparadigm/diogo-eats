// Unit tests for lib/dayReport.ts — the copy-day markdown formatter.
// Ported from the web; the output must stay byte-faithful to the format
// the web's CopyDayButton produces.

import { formatDayReport, isBackfillCreatedAt } from "../lib/dayReport";
import type { Meal } from "../lib/types";

function meal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "m1",
    created_at: new Date(2026, 5, 10, 8, 30).getTime(),
    photo_filename: null,
    items_json: JSON.stringify([
      { name: "Oats", grams: 80, confidence: "high", is_plant: true, per_100g: { sat_fat_g: 1, soluble_fiber_g: 4, calories: 380, protein_g: 13 } },
      { name: "Banana", grams: 120, confidence: "high", is_plant: true, per_100g: { sat_fat_g: 0, soluble_fiber_g: 1, calories: 89, protein_g: 1 } },
    ]),
    sat_fat_g: 0.8,
    soluble_fiber_g: 4.4,
    calories: 411,
    protein_g: 11.6,
    plant_pct: 100,
    notes: null,
    caption: "morning oats",
    meal_vibe: "fiber-friendly snack",
    ...overrides,
  };
}

describe("isBackfillCreatedAt", () => {
  it("recognises the 23:59:59 backfill sentinel", () => {
    expect(isBackfillCreatedAt(new Date(2026, 5, 10, 23, 59, 59).getTime())).toBe(true);
    expect(isBackfillCreatedAt(new Date(2026, 5, 10, 8, 30, 0).getTime())).toBe(false);
  });
});

describe("formatDayReport", () => {
  it("handles an empty day", () => {
    expect(formatDayReport([], new Date(2026, 5, 10))).toBe(
      "# eats · 2026-06-10\n\nno meals logged."
    );
  });

  it("includes the date header, day totals, and the meal", () => {
    const out = formatDayReport([meal()], new Date(2026, 5, 10));
    expect(out).toContain("# eats · 2026-06-10");
    expect(out).toContain("## day totals");
    expect(out).toContain("411 kcal");
    expect(out).toContain("## meals (1)");
    expect(out).toContain("*fiber-friendly snack*");
    expect(out).toContain("> morning oats");
    expect(out).toContain("- 80g Oats");
    expect(out).toContain("- 120g Banana");
  });

  it("labels a backfilled meal 'added later' instead of a clock", () => {
    const out = formatDayReport(
      [meal({ created_at: new Date(2026, 5, 10, 23, 59, 59).getTime() })],
      new Date(2026, 5, 10)
    );
    expect(out).toContain("### added later");
  });

  it("tags a 100% plant meal", () => {
    const out = formatDayReport([meal({ plant_pct: 100 })], new Date(2026, 5, 10));
    expect(out).toContain("· 100% plant");
  });
});
