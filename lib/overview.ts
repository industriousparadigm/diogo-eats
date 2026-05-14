// Pure helpers for the /overview page. Kept separate from db/api so they
// can be unit-tested with synthetic DayAggregate fixtures.

import type { DayAggregate } from "./types";
import type { Targets } from "./targets";

export type Flag =
  | "all_plant"
  | "fiber_hit"
  | "low_sat_fat"
  | "clean_day"
  | "high_sat_fat";

export function isPositiveFlag(f: Flag): boolean {
  return f === "all_plant" || f === "fiber_hit" || f === "low_sat_fat" || f === "clean_day";
}

// Derive day-level flags from the aggregate alone. No new vision work
// needed — these are all reads from existing fields. The "alcohol" /
// "ultra-processed" markers wait for a future data-model expansion.
export function flagsForDay(agg: DayAggregate, targets: Targets): Flag[] {
  if (agg.meal_count === 0) return [];
  const out: Flag[] = [];
  if (agg.plant_pct >= 95) out.push("all_plant");
  if (agg.soluble_fiber_g >= targets.soluble_fiber_g) out.push("fiber_hit");
  if (agg.sat_fat_g <= targets.sat_fat_g * 0.5) out.push("low_sat_fat");
  if (
    out.includes("all_plant") &&
    out.includes("fiber_hit") &&
    out.includes("low_sat_fat")
  ) {
    out.push("clean_day");
  }
  if (agg.sat_fat_g >= targets.sat_fat_g * 1.5) out.push("high_sat_fat");
  return out;
}

export type Averages = {
  plant_pct: number;
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  logged_days: number;
  total_days: number;
  total_logs: number;
};

// Averaged over LOGGED days only. An unobserved day is "no data," not
// "zero fiber" — letting it pull averages to zero would punish gaps.
// The logged_days / total_days fields surface coverage honestly.
export function windowAverages(aggs: DayAggregate[]): Averages {
  const logged = aggs.filter((a) => a.meal_count > 0);
  return {
    plant_pct: mean(logged.map((a) => a.plant_pct)),
    sat_fat_g: mean(logged.map((a) => a.sat_fat_g)),
    soluble_fiber_g: mean(logged.map((a) => a.soluble_fiber_g)),
    calories: mean(logged.map((a) => a.calories)),
    protein_g: mean(logged.map((a) => a.protein_g)),
    logged_days: logged.length,
    total_days: aggs.length,
    total_logs: logged.reduce((s, a) => s + a.meal_count, 0),
  };
}

// Longest consecutive run of LOGGED days matching pred. Empty (unlogged)
// days break the streak — "I didn't observe" can't count as "I did well."
export function longestStreak<T extends DayAggregate>(
  aggs: T[],
  pred: (a: T) => boolean
): { length: number; endDate: string | null } {
  let best = 0;
  let cur = 0;
  let bestEnd: string | null = null;
  for (const a of aggs) {
    if (a.meal_count > 0 && pred(a)) {
      cur += 1;
      if (cur > best) {
        best = cur;
        bestEnd = a.date;
      }
    } else {
      cur = 0;
    }
  }
  return { length: best, endDate: bestEnd };
}

// Rule-based one-liner summarizing the window. Mirrors home's RollingHeadline
// in spirit — celebrate plant + fiber when they're there, flag sat fat only
// when meaningfully over, never moralize a single bite.
export function summarySentence(av: Averages, targets: Targets): string {
  if (av.logged_days === 0) return "Nothing logged in this window.";

  const wins: string[] = [];
  if (av.plant_pct >= 80) wins.push("Plant-led");
  else if (av.plant_pct >= 60) wins.push("Plant-leaning");
  else if (av.plant_pct >= 40) wins.push("Mixed");
  else wins.push("Animal-leaning");

  if (av.soluble_fiber_g >= targets.soluble_fiber_g) wins.push("fiber on target");
  else if (av.soluble_fiber_g >= targets.soluble_fiber_g * 0.75)
    wins.push("fiber close to target");

  if (av.sat_fat_g <= targets.sat_fat_g * 0.7) wins.push("sat fat well under");
  else if (av.sat_fat_g >= targets.sat_fat_g * 1.2) wins.push("sat fat over target");

  return wins.join(", ") + ".";
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
