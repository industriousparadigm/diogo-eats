import type { DayAggregate } from "./types";

// Pure data prep for the per-day bar chart. Replaces the old 7-day-rolling
// smoothing — that flattened every meaningful spike. Each day is now a
// distinct bar with its real value, optionally with a horizontal target
// reference line and Y-axis ticks.

export type DayBar = {
  date: string;     // YYYY-MM-DD
  value: number;    // raw per-day value (after the accessor)
  ratio: number;    // value / chart max, in [0,1]
  logged: boolean;  // meal_count > 0 — renderer can dim unlogged days
};

export type DayBarsResult = {
  bars: DayBar[];
  max: number;             // chart-top value (Y-max)
  targetRatio: number | null; // height ratio of the target line, or null if no target
  latest: number;          // most-recent logged day's value, for the header readout
  hasData: boolean;        // false when every day is unlogged or zero
};

// Pick a "nice" round ceiling above the given max so the Y-axis has
// clean numbers. We accept an optional target so the chart shows useful
// context even when actual values are well below the goal (e.g. fiber).
export function niceMax(maxValue: number, target?: number): number {
  const floor = target ? target * 1.15 : 0;
  const m = Math.max(maxValue, floor);
  if (m <= 0) return 0;
  const exp = Math.floor(Math.log10(m));
  const base = Math.pow(10, exp);
  const norm = m / base;
  // Fine-grained buckets so 2521 → 3000, not 5000.
  const buckets = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const bucket = buckets.find((b) => b >= norm) ?? 10;
  return bucket * base;
}

// 3-5 evenly-spaced ticks from 0 to max, inclusive.
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  // Pick a step that yields 3-5 ticks at "nice" round multiples.
  const candidates = [max / 4, max / 3, max / 2];
  let step = candidates[0];
  for (const c of candidates) {
    // prefer the smaller step if it lands on a round number
    const rounded = roundToNiceStep(c);
    if (rounded * 4 >= max * 0.9 && rounded * 4 <= max * 1.1) {
      step = rounded;
      break;
    }
    step = rounded;
  }
  const ticks: number[] = [];
  for (let v = 0; v <= max + 0.0001; v += step) {
    ticks.push(Math.round(v * 100) / 100);
    if (ticks.length > 8) break; // hard cap on overflow
  }
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

function roundToNiceStep(v: number): number {
  if (v <= 0) return 0;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const norm = v / base;
  let snapped: number;
  if (norm <= 1) snapped = 1;
  else if (norm <= 2) snapped = 2;
  else if (norm <= 5) snapped = 5;
  else snapped = 10;
  return snapped * base;
}

export function prepDayBars(
  aggregates: DayAggregate[],
  accessor: (a: DayAggregate) => number,
  target: number | undefined
): DayBarsResult {
  const rawValues = aggregates.map((a) => (a.meal_count > 0 ? accessor(a) : 0));
  const peak = rawValues.reduce((m, v) => (v > m ? v : m), 0);
  const max = niceMax(peak, target);

  const bars: DayBar[] = aggregates.map((a, i) => ({
    date: a.date,
    value: rawValues[i],
    ratio: max > 0 ? rawValues[i] / max : 0,
    logged: a.meal_count > 0,
  }));

  let latest = 0;
  for (let i = aggregates.length - 1; i >= 0; i--) {
    if (aggregates[i].meal_count > 0) {
      latest = accessor(aggregates[i]);
      break;
    }
  }

  const hasData = bars.some((b) => b.logged && b.value > 0);
  const targetRatio = target && max > 0 ? target / max : null;

  return { bars, max, targetRatio, latest, hasData };
}
