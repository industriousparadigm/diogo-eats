import { describe, it, expect } from "vitest";
import {
  flagsForDay,
  windowAverages,
  longestStreak,
  summarySentence,
  isPositiveFlag,
  type Flag,
} from "../overview";
import type { DayAggregate } from "../types";
import type { Targets } from "../targets";

const targets: Targets = {
  sat_fat_g: 18,
  soluble_fiber_g: 10,
  calories: 2000,
  protein_g: 90,
};

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

describe("flagsForDay", () => {
  it("returns empty array for unlogged days", () => {
    expect(flagsForDay(day("2026-05-14", 0), targets)).toEqual([]);
  });

  it("emits all_plant when plant_pct >= 95", () => {
    expect(flagsForDay(day("2026-05-14", 2, { plant_pct: 95 }), targets)).toContain(
      "all_plant"
    );
    expect(flagsForDay(day("2026-05-14", 2, { plant_pct: 94 }), targets)).not.toContain(
      "all_plant"
    );
  });

  it("emits fiber_hit when soluble fiber meets target", () => {
    expect(flagsForDay(day("x", 1, { soluble_fiber_g: 10 }), targets)).toContain(
      "fiber_hit"
    );
    expect(flagsForDay(day("x", 1, { soluble_fiber_g: 9.9 }), targets)).not.toContain(
      "fiber_hit"
    );
  });

  it("emits low_sat_fat at or under half the target", () => {
    expect(flagsForDay(day("x", 1, { sat_fat_g: 9 }), targets)).toContain("low_sat_fat");
    expect(flagsForDay(day("x", 1, { sat_fat_g: 9.1 }), targets)).not.toContain(
      "low_sat_fat"
    );
  });

  it("emits clean_day only when all three positives hit", () => {
    const flags = flagsForDay(
      day("x", 1, { plant_pct: 100, soluble_fiber_g: 12, sat_fat_g: 5 }),
      targets
    );
    expect(flags).toContain("clean_day");
    expect(flags).toContain("all_plant");
    expect(flags).toContain("fiber_hit");
    expect(flags).toContain("low_sat_fat");
  });

  it("emits high_sat_fat at 1.5x target or above", () => {
    expect(flagsForDay(day("x", 1, { sat_fat_g: 27 }), targets)).toContain("high_sat_fat");
    expect(flagsForDay(day("x", 1, { sat_fat_g: 26 }), targets)).not.toContain(
      "high_sat_fat"
    );
  });
});

describe("isPositiveFlag", () => {
  it("classifies the four positive flags correctly", () => {
    const positives: Flag[] = ["all_plant", "fiber_hit", "low_sat_fat", "clean_day"];
    for (const f of positives) expect(isPositiveFlag(f)).toBe(true);
    expect(isPositiveFlag("high_sat_fat")).toBe(false);
  });
});

describe("windowAverages", () => {
  it("averages only logged days — empty days don't pull to zero", () => {
    const aggs = [
      day("d1", 0),
      day("d2", 2, { plant_pct: 80, soluble_fiber_g: 10, sat_fat_g: 12 }),
      day("d3", 0),
      day("d4", 3, { plant_pct: 60, soluble_fiber_g: 8, sat_fat_g: 14 }),
    ];
    const av = windowAverages(aggs);
    expect(av.plant_pct).toBe(70); // (80 + 60) / 2
    expect(av.soluble_fiber_g).toBe(9);
    expect(av.sat_fat_g).toBe(13);
    expect(av.logged_days).toBe(2);
    expect(av.total_days).toBe(4);
    expect(av.total_logs).toBe(5);
  });

  it("returns zeros for an empty window", () => {
    const av = windowAverages([day("d1", 0), day("d2", 0)]);
    expect(av.plant_pct).toBe(0);
    expect(av.logged_days).toBe(0);
    expect(av.total_logs).toBe(0);
  });
});

describe("longestStreak", () => {
  it("counts consecutive matching logged days", () => {
    const aggs = [
      day("d1", 1, { plant_pct: 90 }),
      day("d2", 1, { plant_pct: 95 }),
      day("d3", 1, { plant_pct: 70 }), // breaks
      day("d4", 1, { plant_pct: 100 }),
      day("d5", 1, { plant_pct: 90 }),
      day("d6", 1, { plant_pct: 85 }),
    ];
    const { length, endDate } = longestStreak(aggs, (a) => a.plant_pct >= 80);
    expect(length).toBe(3);
    expect(endDate).toBe("d6");
  });

  it("unlogged days break the streak", () => {
    const aggs = [
      day("d1", 1, { plant_pct: 95 }),
      day("d2", 0), // gap
      day("d3", 1, { plant_pct: 95 }),
    ];
    expect(longestStreak(aggs, (a) => a.plant_pct >= 80).length).toBe(1);
  });

  it("returns zero when nothing matches", () => {
    const aggs = [day("d1", 1, { plant_pct: 50 })];
    expect(longestStreak(aggs, (a) => a.plant_pct >= 80).length).toBe(0);
  });
});

describe("summarySentence", () => {
  it("speaks coverage when nothing logged", () => {
    expect(summarySentence(windowAverages([day("d1", 0)]), targets)).toBe(
      "Nothing logged in this window."
    );
  });

  it("celebrates plant-led + fiber on target", () => {
    const aggs = [
      day("d1", 2, { plant_pct: 90, soluble_fiber_g: 12, sat_fat_g: 10 }),
      day("d2", 2, { plant_pct: 85, soluble_fiber_g: 11, sat_fat_g: 12 }),
    ];
    const s = summarySentence(windowAverages(aggs), targets);
    expect(s).toContain("Plant-led");
    expect(s).toContain("fiber on target");
  });

  it("flags sat fat over target only when meaningfully over", () => {
    const aggs = [
      day("d1", 1, { plant_pct: 40, soluble_fiber_g: 3, sat_fat_g: 25 }),
    ];
    const s = summarySentence(windowAverages(aggs), targets);
    expect(s).toContain("sat fat over target");
  });

  it("does NOT flag a single bite over target", () => {
    const aggs = [
      day("d1", 1, { plant_pct: 60, soluble_fiber_g: 5, sat_fat_g: 19 }), // barely over
    ];
    const s = summarySentence(windowAverages(aggs), targets);
    expect(s).not.toContain("sat fat over target");
  });
});
