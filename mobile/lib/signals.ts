// Day-level SIGNALS for the looking-back surface (overview item 4).
//
// The per-day data already exists in /api/stats (alcohol_g, plant_pct,
// calories, meal_count) and the profile targets. This pure helper distills
// the window into a few HONEST COUNTS — facts about the window, never
// grades. No shame language: "alcohol on N days" is a fact, not a verdict
// (food constitution: identity, not grades; alcohol is a fact, not a sin).
//
// WINDOW-SCOPED: the caller passes the same window everything else uses, so
// the counts describe exactly the period the selector shows.
//
// The chosen four (most meaningful for the LDL goal + honest about the log):
//   - days fully plant     (plant_pct >= 100) — the celebrated lever
//   - alcohol days         (alcohol_g > 0)    — a neutral fact, no red
//   - days over kcal target (calories > target, when a target exists)
//   - days logged          (meal_count > 0)   — coverage honesty
//
// Each carries a count AND the denominator it's over (logged days, or all
// days for the coverage signal) so the UI can render "N of M" without
// re-deriving. A null target disables the kcal signal rather than guessing.

import type { DayAggregate } from "./types";

export type Signal = {
  // A stable, plain-language key (never a cryptic code) so the UI can pick
  // an order / styling without string-matching the label.
  key: "fully_plant" | "alcohol" | "over_kcal" | "logged";
  count: number;
  // The denominator the count is "of": logged days for behavior signals,
  // total window days for the coverage signal. null when there's no honest
  // denominator (e.g. kcal target absent → the signal is omitted entirely).
  of: number;
  // The window-relative label, e.g. "days 100% plant". The count is rendered
  // separately by the UI (the number is the point), so the label is the noun
  // phrase only.
  label: string;
};

export type SignalsInput = {
  // The kcal target from the profile. null/non-positive disables the
  // over-kcal signal (we don't invent a threshold).
  caloriesTarget: number | null;
};

export function deriveSignals(
  aggs: DayAggregate[],
  input: SignalsInput
): Signal[] {
  const logged = aggs.filter((a) => a.meal_count > 0);
  const totalDays = aggs.length;
  const loggedDays = logged.length;

  const out: Signal[] = [];

  // Days fully plant — the celebrated lever, leads.
  const fullyPlant = logged.filter((a) => a.plant_pct >= 100).length;
  out.push({
    key: "fully_plant",
    count: fullyPlant,
    of: loggedDays,
    label: fullyPlant === 1 ? "day 100% plant" : "days 100% plant",
  });

  // Alcohol days — a neutral fact. Only meaningful over logged days.
  const alcoholDays = logged.filter((a) => a.alcohol_g > 0).length;
  out.push({
    key: "alcohol",
    count: alcoholDays,
    of: loggedDays,
    label: alcoholDays === 1 ? "day with alcohol" : "days with alcohol",
  });

  // Days over the kcal target — omitted entirely when there's no honest
  // target to compare against (don't guess a threshold).
  const target = input.caloriesTarget;
  if (typeof target === "number" && Number.isFinite(target) && target > 0) {
    const overKcal = logged.filter((a) => a.calories > target).length;
    out.push({
      key: "over_kcal",
      count: overKcal,
      of: loggedDays,
      label: overKcal === 1 ? "day over kcal target" : "days over kcal target",
    });
  }

  // Days logged — coverage honesty. Over the WHOLE window (the denominator
  // is every calendar day in the period, not just logged ones).
  out.push({
    key: "logged",
    count: loggedDays,
    of: totalDays,
    label: loggedDays === 1 ? "day fully logged" : "days fully logged",
  });

  return out;
}
