// Unit tests for lib/trendChart.ts — the pure geometry behind the rebuilt
// trend charts (wave-2 item 5): the scrub x→day-index inverse, the Y/X
// gridline + tick selection, the short date label, and the plot max.

import {
  xForIndex,
  indexForX,
  yGridValues,
  xTickIndices,
  shortDateLabel,
  plotMax,
  dayAtIndex,
  decimateToWeekly,
  DECIMATE_THRESHOLD_DAYS,
} from "../lib/trendChart";
import type { DayAggregate } from "../lib/types";

describe("xForIndex / indexForX (scrub round-trip)", () => {
  it("spaces points evenly across the width", () => {
    // 5 points over width 100 -> step 25.
    expect(xForIndex(0, 5, 100)).toBeCloseTo(0);
    expect(xForIndex(2, 5, 100)).toBeCloseTo(50);
    expect(xForIndex(4, 5, 100)).toBeCloseTo(100);
  });

  it("a single point sits at the origin", () => {
    expect(xForIndex(0, 1, 100)).toBe(0);
  });

  it("maps a touch x back to the nearest point index", () => {
    // step 25: x=0->0, x=12->0 (nearer 0), x=13->1 (nearer 25), x=60->2.
    expect(indexForX(0, 5, 100)).toBe(0);
    expect(indexForX(12, 5, 100)).toBe(0);
    expect(indexForX(13, 5, 100)).toBe(1);
    expect(indexForX(60, 5, 100)).toBe(2);
    expect(indexForX(100, 5, 100)).toBe(4);
  });

  it("clamps a touch beyond either edge", () => {
    expect(indexForX(-50, 5, 100)).toBe(0);
    expect(indexForX(999, 5, 100)).toBe(4);
  });

  it("round-trips: indexForX(xForIndex(i)) === i", () => {
    const count = 14;
    const width = 280;
    for (let i = 0; i < count; i++) {
      expect(indexForX(xForIndex(i, count, width), count, width)).toBe(i);
    }
  });

  it("is safe with a zero/one-point chart and zero width", () => {
    expect(indexForX(40, 1, 100)).toBe(0);
    expect(indexForX(40, 5, 0)).toBe(0);
  });
});

describe("yGridValues", () => {
  it("includes the target and the max, sorted ascending", () => {
    const g = yGridValues(10, 15);
    expect(g[0]).toBe(10);
    expect(g[g.length - 1]).toBe(15);
  });

  it("adds a midline when the max is well above the target", () => {
    // max 30 > target 10 * 1.4 -> a third line between.
    const g = yGridValues(10, 30);
    expect(g.length).toBe(3);
    expect(g).toContain(10);
    expect(g).toContain(30);
    expect(g).toContain(20);
  });

  it("does not duplicate when target equals max", () => {
    expect(yGridValues(12, 12)).toEqual([12]);
  });

  it("drops the target line when it sits above the plotted max", () => {
    const g = yGridValues(50, 12);
    expect(g).toEqual([12]);
  });
});

describe("xTickIndices", () => {
  it("returns start / middle / end for 3+ points", () => {
    expect(xTickIndices(7)).toEqual([0, 3, 6]);
    expect(xTickIndices(10)).toEqual([0, 4, 9]);
  });

  it("returns the ends for 2 points and the single for 1", () => {
    expect(xTickIndices(2)).toEqual([0, 1]);
    expect(xTickIndices(1)).toEqual([0]);
    expect(xTickIndices(0)).toEqual([]);
  });
});

describe("shortDateLabel", () => {
  it("formats YYYY-MM-DD as 'D Mon'", () => {
    expect(shortDateLabel("2026-06-05")).toBe("5 Jun");
    expect(shortDateLabel("2026-01-31")).toBe("31 Jan");
  });

  it("returns the input unchanged when not a date", () => {
    expect(shortDateLabel("nope")).toBe("nope");
    expect(shortDateLabel("2026-13-01")).toBe("2026-13-01");
  });
});

describe("plotMax", () => {
  it("leaves headroom over both target and data", () => {
    expect(plotMax(10, [5, 8, 12])).toBe(15); // target*1.5 wins over data
    expect(plotMax(10, [5, 8, 40])).toBe(40); // data peak wins
  });

  it("ignores NaN gaps and never returns < 1", () => {
    expect(plotMax(0, [NaN, NaN])).toBe(1);
  });
});

describe("dayAtIndex", () => {
  function agg(date: string): DayAggregate {
    return {
      date,
      meal_count: 1,
      plant_pct: 70,
      sat_fat_g: 9,
      soluble_fiber_g: 12,
      calories: 1800,
      protein_g: 80,
      carbs_g: 200,
      alcohol_g: 0,
      kcal_burn: null,
    };
  }

  it("returns the day at a valid index, null out of range", () => {
    const win = [agg("2026-06-01"), agg("2026-06-02")];
    expect(dayAtIndex(win, 0)?.date).toBe("2026-06-01");
    expect(dayAtIndex(win, 1)?.date).toBe("2026-06-02");
    expect(dayAtIndex(win, 2)).toBeNull();
    expect(dayAtIndex(win, -1)).toBeNull();
  });
});

describe("decimateToWeekly (1y decimation)", () => {
  function ymd(i: number): string {
    // 2026-01-01 + i days, kept simple (Jan has 31 days, enough headroom
    // for the small fixtures here — we don't cross into Feb in counts).
    const d = String(i + 1).padStart(2, "0");
    return `2026-01-${d}`;
  }
  function day(i: number, overrides: Partial<DayAggregate> = {}): DayAggregate {
    return {
      date: ymd(i),
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

  it("buckets a year into ~52 weekly points (a light SVG path)", () => {
    const year = Array.from({ length: 365 }, (_, i) => day(i % 31));
    const weekly = decimateToWeekly(year);
    // 365 / 7 = 52.1 -> 53 buckets (the oldest is a short 1-day bucket).
    expect(weekly.length).toBe(53);
    // Far fewer points than the raw window — the whole point of decimation.
    expect(weekly.length).toBeLessThan(year.length / 6);
  });

  it("threshold leaves 3mo (90d) per-day and only buckets above 120d", () => {
    // 90 days is under the threshold -> the chart plots per-day, no bucketing.
    expect(90).toBeLessThanOrEqual(DECIMATE_THRESHOLD_DAYS);
    expect(365).toBeGreaterThan(DECIMATE_THRESHOLD_DAYS);
  });

  it("a weekly bucket averages its logged days' values", () => {
    // 7 days, fiber 6..12 -> mean 9.
    const week = [6, 7, 8, 9, 10, 11, 12].map((v, i) =>
      day(i, { soluble_fiber_g: v })
    );
    const [bucket] = decimateToWeekly(week);
    expect(bucket.soluble_fiber_g).toBeCloseTo(9);
    expect(bucket.meal_count).toBe(7); // all 7 logged
    expect(bucket.date).toBe(ymd(0)); // anchored to the week's first day
  });

  it("an all-empty week becomes a gap bucket (meal_count 0) — never pulls to zero", () => {
    const week = Array.from({ length: 7 }, (_, i) => day(i, { meal_count: 0 }));
    const [bucket] = decimateToWeekly(week);
    expect(bucket.meal_count).toBe(0);
    // A downstream rollingAverage / the chart's per-bucket NaN treats this
    // as missing, not a real zero.
  });

  it("a partial trailing week only averages the days it has", () => {
    // 10 days: newest 7 form one bucket, oldest 3 form a short bucket.
    const ten = Array.from({ length: 10 }, (_, i) => day(i, { sat_fat_g: 10 }));
    const weekly = decimateToWeekly(ten);
    expect(weekly.length).toBe(2);
    expect(weekly[0].meal_count).toBe(3); // the short bucket sits oldest
    expect(weekly[1].meal_count).toBe(7);
  });

  it("stays chronological ascending (oldest first)", () => {
    const fourteen = Array.from({ length: 14 }, (_, i) => day(i));
    const weekly = decimateToWeekly(fourteen);
    expect(weekly[0].date < weekly[1].date).toBe(true);
  });

  it("handles an empty window", () => {
    expect(decimateToWeekly([])).toEqual([]);
  });
});
