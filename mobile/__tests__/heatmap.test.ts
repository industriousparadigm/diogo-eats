// Unit tests for lib/heatmap.ts — week-grid assembly for the calendar.

import { buildWeekGrid, monthLabelFor } from "../lib/heatmap";
import type { DayAggregate } from "../lib/types";

function day(date: string, mealCount = 1): DayAggregate {
  return {
    date,
    meal_count: mealCount,
    plant_pct: 70,
    sat_fat_g: 10,
    soluble_fiber_g: 12,
    calories: 1800,
    protein_g: 80,
    carbs_g: 200,
    alcohol_g: 0,
    kcal_burn: null,
  };
}

describe("buildWeekGrid", () => {
  it("returns an empty grid for no data", () => {
    expect(buildWeekGrid([]).weeks).toEqual([]);
  });

  it("pads each column to a full Sunday-Saturday week", () => {
    // 2026-06-10 is a Wednesday.
    const grid = buildWeekGrid([day("2026-06-10")]);
    expect(grid.weeks).toHaveLength(1);
    expect(grid.weeks[0]).toHaveLength(7);
    // Wednesday = index 3; everything else is padding.
    expect(grid.weeks[0][3]?.date).toBe("2026-06-10");
    expect(grid.weeks[0][0]).toBeNull();
    expect(grid.weeks[0][6]).toBeNull();
  });

  it("splits consecutive days across week columns", () => {
    // Sat 2026-06-06 then Sun 2026-06-07 — different weeks.
    const grid = buildWeekGrid([day("2026-06-06"), day("2026-06-07")]);
    expect(grid.weeks).toHaveLength(2);
    expect(grid.weeks[0][6]?.date).toBe("2026-06-06");
    expect(grid.weeks[1][0]?.date).toBe("2026-06-07");
  });

  it("keeps days in their weekday rows", () => {
    const grid = buildWeekGrid([
      day("2026-06-08"), // Monday
      day("2026-06-09"), // Tuesday
      day("2026-06-10"), // Wednesday
    ]);
    expect(grid.weeks).toHaveLength(1);
    expect(grid.weeks[0][1]?.date).toBe("2026-06-08");
    expect(grid.weeks[0][2]?.date).toBe("2026-06-09");
    expect(grid.weeks[0][3]?.date).toBe("2026-06-10");
  });
});

describe("monthLabelFor", () => {
  it("labels the first column with its month", () => {
    const grid = buildWeekGrid([day("2026-06-10")]);
    expect(monthLabelFor(grid.weeks, 0)).toBe(5); // June = month index 5
  });

  it("labels a column when the month changes", () => {
    // Last week of May into first week of June 2026.
    const grid = buildWeekGrid([day("2026-05-30"), day("2026-06-01")]);
    expect(grid.weeks.length).toBeGreaterThanOrEqual(2);
    expect(monthLabelFor(grid.weeks, 0)).toBe(4); // May
    expect(monthLabelFor(grid.weeks, 1)).toBe(5); // June
  });

  it("returns null when the month is unchanged", () => {
    const grid = buildWeekGrid([day("2026-06-03"), day("2026-06-10")]);
    expect(grid.weeks).toHaveLength(2);
    expect(monthLabelFor(grid.weeks, 1)).toBeNull();
  });
});
