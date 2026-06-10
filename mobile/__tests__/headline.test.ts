// Unit tests for lib/headline.ts — rolling headline rules (ported from
// the web's lib/rolling-headline.ts), the shared visible-window logic,
// rolling averages, and the coverage-honest averages block.

import {
  buildHeadline,
  visibleAggregates,
  rollingAverage,
  loggedAverages,
} from "../lib/headline";
import type { DayAggregate } from "../lib/types";

const TARGETS = { sat_fat_g: 18, soluble_fiber_g: 10 };

function day(date: string, overrides: Partial<DayAggregate> = {}): DayAggregate {
  return {
    date,
    meal_count: 1,
    plant_pct: 70,
    sat_fat_g: 10,
    soluble_fiber_g: 12,
    calories: 1800,
    protein_g: 80,
    carbs_g: 200,
    alcohol_g: 0,
    kcal_burn: null,
    ...overrides,
  };
}

function days(n: number, overrides: Partial<DayAggregate> = {}): DayAggregate[] {
  return Array.from({ length: n }, (_, i) =>
    day(`2026-05-${String(i + 1).padStart(2, "0")}`, overrides)
  );
}

describe("buildHeadline", () => {
  it("returns null below 3 logged days", () => {
    expect(buildHeadline(days(2), TARGETS)).toBeNull();
    expect(buildHeadline([], TARGETS)).toBeNull();
  });

  it("ignores unlogged days when counting", () => {
    const aggs = [...days(2), day("2026-05-20", { meal_count: 0 })];
    expect(buildHeadline(aggs, TARGETS)).toBeNull();
  });

  it("leads with the plant word for plant-leaning eating", () => {
    const line = buildHeadline(days(5, { plant_pct: 70 }), TARGETS);
    expect(line).toContain("plant-leaning");
  });

  it("says mostly plant-based at 80%+", () => {
    const line = buildHeadline(days(5, { plant_pct: 85 }), TARGETS);
    expect(line).toContain("mostly plant-based");
  });

  it("celebrates fiber when on track most days", () => {
    const line = buildHeadline(days(5, { soluble_fiber_g: 12 }), TARGETS);
    expect(line).toContain("fiber on track most days");
  });

  it("suggests fiber sources when fiber is low", () => {
    const line = buildHeadline(days(5, { soluble_fiber_g: 2 }), TARGETS);
    expect(line).toContain("oats, beans, psyllium");
  });

  it("omits sat fat when unremarkable", () => {
    const line = buildHeadline(days(5, { sat_fat_g: 10 }), TARGETS);
    expect(line).not.toContain("sat fat");
  });

  it("mentions sat fat above target without prior context", () => {
    const line = buildHeadline(days(5, { sat_fat_g: 30 }), TARGETS);
    expect(line).toContain("sat fat above target");
  });

  it("mentions the trend when sat fat moved >=15% vs prior 14 days", () => {
    const prior = days(14, { sat_fat_g: 20 });
    const recent = Array.from({ length: 14 }, (_, i) =>
      day(`2026-06-${String(i + 1).padStart(2, "0")}`, { sat_fat_g: 10 })
    );
    const line = buildHeadline([...prior, ...recent], TARGETS);
    expect(line).toContain("sat fat trending down");
  });

  it("counts only logged days in the range copy", () => {
    const line = buildHeadline(days(5), TARGETS);
    expect(line).toContain("Last 5 logged days");
  });
});

describe("visibleAggregates", () => {
  it("returns last 7 days when nothing is logged", () => {
    const aggs = days(20, { meal_count: 0 });
    expect(visibleAggregates(aggs)).toHaveLength(7);
  });

  it("starts ~1 week before the earliest log", () => {
    const aggs = [
      ...days(10, { meal_count: 0 }),
      day("2026-05-20"),
      day("2026-05-21"),
    ];
    const visible = visibleAggregates(aggs);
    // 10 unlogged, first log at index 10 -> buffer starts at index 3.
    expect(visible).toHaveLength(9);
    expect(visible[7].date).toBe("2026-05-20");
  });

  it("caps at 84 days back", () => {
    const aggs = Array.from({ length: 100 }, (_, i) =>
      day(`d${i}`, { meal_count: 1 })
    );
    expect(visibleAggregates(aggs)).toHaveLength(84);
  });

  it("handles empty input", () => {
    expect(visibleAggregates([])).toEqual([]);
  });
});

describe("rollingAverage", () => {
  it("averages the trailing 7 logged days", () => {
    const aggs = days(7, { soluble_fiber_g: 10 });
    const points = rollingAverage(aggs, (a) => a.soluble_fiber_g);
    expect(points[6]).toBeCloseTo(10);
  });

  it("skips unlogged days instead of pulling toward zero", () => {
    const aggs = [
      day("2026-05-01", { soluble_fiber_g: 10 }),
      day("2026-05-02", { meal_count: 0, soluble_fiber_g: 0 }),
      day("2026-05-03", { soluble_fiber_g: 20 }),
    ];
    const points = rollingAverage(aggs, (a) => a.soluble_fiber_g);
    expect(points[2]).toBeCloseTo(15); // (10 + 20) / 2, the empty day ignored
  });

  it("yields NaN when the trailing window has no logged days", () => {
    const aggs = days(3, { meal_count: 0 });
    const points = rollingAverage(aggs, (a) => a.soluble_fiber_g);
    expect(points.every((p) => isNaN(p))).toBe(true);
  });
});

describe("loggedAverages", () => {
  it("averages only logged days and reports the count", () => {
    const aggs = [
      day("2026-05-01", { calories: 2000 }),
      day("2026-05-02", { meal_count: 0, calories: 0 }),
      day("2026-05-03", { calories: 1000 }),
    ];
    const avg = loggedAverages(aggs);
    expect(avg.loggedDays).toBe(2);
    expect(avg.calories).toBeCloseTo(1500);
  });

  it("limits to the last N logged days", () => {
    const aggs = [
      ...days(20, { plant_pct: 0 }),
      ...Array.from({ length: 14 }, (_, i) =>
        day(`2026-06-${String(i + 1).padStart(2, "0")}`, { plant_pct: 100 })
      ),
    ];
    const avg = loggedAverages(aggs, 14);
    expect(avg.loggedDays).toBe(14);
    expect(avg.plant_pct).toBeCloseTo(100);
  });

  it("returns zeros with no logged days", () => {
    const avg = loggedAverages(days(5, { meal_count: 0 }));
    expect(avg.loggedDays).toBe(0);
    expect(avg.calories).toBe(0);
  });
});
