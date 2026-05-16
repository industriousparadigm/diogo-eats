import { describe, it, expect } from "vitest";
import { prepDayBars, niceMax, niceTicks } from "../chartData";
import type { DayAggregate } from "../types";

function day(
  date: string,
  meal_count: number,
  fields: Partial<Omit<DayAggregate, "date" | "meal_count">> = {}
): DayAggregate {
  return {
    date,
    meal_count,
    plant_pct: 0,
    sat_fat_g: 0,
    soluble_fiber_g: 0,
    calories: 0,
    protein_g: 0,
    ...fields,
  };
}

describe("niceMax", () => {
  it("rounds to a humane scale ceiling", () => {
    expect(niceMax(2521)).toBeGreaterThanOrEqual(2521);
    expect(niceMax(2521)).toBeLessThanOrEqual(3500);
  });

  it("returns 0 when all data is 0 (no chart to draw)", () => {
    expect(niceMax(0)).toBe(0);
  });

  it("respects a soft floor based on the target so the chart shows context", () => {
    // If max value is 5 but target is 18, we still want a ceiling above the target.
    expect(niceMax(5, 18)).toBeGreaterThanOrEqual(18);
  });

  it("never goes below the actual max value", () => {
    expect(niceMax(2521, 2000)).toBeGreaterThanOrEqual(2521);
  });
});

describe("niceTicks", () => {
  it("returns 0 plus 2-3 evenly spaced ticks for a typical max", () => {
    const ticks = niceTicks(3000);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(3000);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(6);
  });

  it("returns just [0] when max is 0", () => {
    expect(niceTicks(0)).toEqual([0]);
  });

  it("ticks are monotonically increasing", () => {
    const ticks = niceTicks(2500);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });
});

describe("prepDayBars", () => {
  const aggs: DayAggregate[] = [
    day("2026-05-10", 3, { calories: 2000 }),
    day("2026-05-11", 2, { calories: 2100 }),
    day("2026-05-12", 0, { calories: 0 }),
    day("2026-05-13", 4, { calories: 4200 }),
    day("2026-05-14", 3, { calories: 2300 }),
  ];

  it("yields one bar per day in the input order", () => {
    const r = prepDayBars(aggs, (a) => a.calories, undefined);
    expect(r.bars.length).toBe(5);
  });

  it("flags unlogged days so the renderer can dim them", () => {
    const r = prepDayBars(aggs, (a) => a.calories, undefined);
    expect(r.bars[2].logged).toBe(false);
    expect(r.bars[0].logged).toBe(true);
  });

  it("reports the actual per-day value (no rolling smoothing)", () => {
    const r = prepDayBars(aggs, (a) => a.calories, undefined);
    expect(r.bars[3].value).toBe(4200);
    expect(r.bars[0].value).toBe(2000);
  });

  it("computes a max that includes the highest day AND any target floor", () => {
    const r = prepDayBars(aggs, (a) => a.calories, 2000);
    expect(r.max).toBeGreaterThanOrEqual(4200);
    expect(r.max).toBeGreaterThanOrEqual(2000);
  });

  it("places target as a ratio in [0,1] of the chart height when supplied", () => {
    const r = prepDayBars(aggs, (a) => a.calories, 2000);
    expect(r.targetRatio).not.toBeNull();
    expect(r.targetRatio!).toBeGreaterThan(0);
    expect(r.targetRatio!).toBeLessThan(1);
  });

  it("returns null targetRatio when target is omitted", () => {
    const r = prepDayBars(aggs, (a) => a.calories, undefined);
    expect(r.targetRatio).toBeNull();
  });

  it("bar height ratios are in [0,1]", () => {
    const r = prepDayBars(aggs, (a) => a.calories, undefined);
    for (const b of r.bars) {
      expect(b.ratio).toBeGreaterThanOrEqual(0);
      expect(b.ratio).toBeLessThanOrEqual(1);
    }
  });

  it("includes the latest non-zero day value as 'latest' for the readout", () => {
    const r = prepDayBars(aggs, (a) => a.calories, undefined);
    // last day's value is 2300 — that's what the readout should show
    expect(r.latest).toBe(2300);
  });

  it("falls back to 0 latest if no logged days exist", () => {
    const empty = aggs.map((a) => ({ ...a, meal_count: 0, calories: 0 }));
    const r = prepDayBars(empty, (a) => a.calories, undefined);
    expect(r.latest).toBe(0);
    expect(r.hasData).toBe(false);
  });

  it("flags hasData=true when at least one logged day has a non-zero value", () => {
    const r = prepDayBars(aggs, (a) => a.calories, undefined);
    expect(r.hasData).toBe(true);
  });
});
