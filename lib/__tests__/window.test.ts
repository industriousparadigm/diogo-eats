import { describe, it, expect } from "vitest";
import { visibleAggregates } from "../window";
import type { DayAggregate } from "../types";

function mkAggs(days: number, loggedIndices: number[] = []): DayAggregate[] {
  // Build a chronological list of `days` empty aggregates ending today,
  // marking specific indices as logged so we can test the windowing rules.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const logged = loggedIndices.includes(i);
    return {
      date: ymd,
      meal_count: logged ? 2 : 0,
      plant_pct: logged ? 70 : 0,
      sat_fat_g: 0,
      soluble_fiber_g: 0,
      calories: 0,
      protein_g: 0,
    };
  });
}

describe("visibleAggregates", () => {
  it("returns empty array for empty input", () => {
    expect(visibleAggregates([])).toEqual([]);
  });

  it("returns last 7 days when no meals logged anywhere", () => {
    const aggs = mkAggs(84);
    const out = visibleAggregates(aggs);
    expect(out.length).toBe(7);
    expect(out[6]).toEqual(aggs[83]); // today is the last
  });

  it("starts ~1 week before earliest log (8-day buffer minimum)", () => {
    // Logged on day index 70 of an 84-day list — first log is 14 days ago
    const aggs = mkAggs(84, [70]);
    const out = visibleAggregates(aggs);
    // Window starts at max(70-7, 84-84) = max(63, 0) = 63
    // So out.length === 84 - 63 = 21
    expect(out.length).toBe(21);
    expect(out[0]).toEqual(aggs[63]);
  });

  it("caps at 84 days back when first log is older than 84 days", () => {
    // Make a 200-day list, logged on day 0 (oldest).
    const aggs = mkAggs(200, [0]);
    const out = visibleAggregates(aggs);
    // Window cap: 200 - 84 = 116, so length = 200 - 116 = 84
    expect(out.length).toBe(84);
    expect(out[0]).toEqual(aggs[116]);
  });

  it("includes the day a meal was logged", () => {
    const aggs = mkAggs(84, [80]); // logged 4 days ago
    const out = visibleAggregates(aggs);
    const loggedDate = aggs[80].date;
    expect(out.find((a) => a.date === loggedDate)).toBeDefined();
  });

  it("always ends with today (the last input agg)", () => {
    const aggs = mkAggs(84, [50]);
    const out = visibleAggregates(aggs);
    expect(out[out.length - 1]).toEqual(aggs[83]);
  });
});
