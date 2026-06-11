// Pure geometry for the trend charts (TrendChart.tsx). Kept here, free of
// react-native-svg / gesture-handler, so the x→day-index scrubbing math and
// the gridline/label layout are unit-testable in isolation.
//
// The chart draws a 7-day rolling-average line over the window's logged
// days. Points are evenly spaced across the plot width; index 0 is the
// oldest day, index N-1 the newest.

import type { DayAggregate } from "./types";

// Evenly-spaced x for a point index, in the same user-space units the line
// path uses (0..width). With one point, it sits at 0.
export function xForIndex(index: number, count: number, width: number): number {
  if (count <= 1) return 0;
  const step = width / (count - 1);
  return index * step;
}

// Map a touch x (in plot user-space, 0..width) back to the NEAREST point
// index. Clamps to [0, count-1]. The inverse of xForIndex, rounded — so a
// finger anywhere along the line snaps to the closest day's value.
export function indexForX(x: number, count: number, width: number): number {
  if (count <= 1) return 0;
  if (width <= 0) return 0;
  const step = width / (count - 1);
  const raw = Math.round(x / step);
  return Math.max(0, Math.min(count - 1, raw));
}

// Choose 2-3 horizontal value gridlines for the Y axis. We always include
// the target (it's the reference the line is read against) plus a line at
// the plotted max, and — when there's vertical room — one between. Returned
// sorted ascending, de-duped, each <= max. Values are in metric units (g).
export function yGridValues(target: number, max: number): number[] {
  const out = new Set<number>();
  if (max > 0) out.add(round1(max));
  if (target > 0 && target <= max) out.add(round1(target));
  // A midline between target and max gives a third reference when the gap
  // is meaningful (keeps a 2-line chart from feeling empty).
  if (target > 0 && max > target * 1.4) {
    out.add(round1((target + max) / 2));
  }
  return [...out].sort((a, b) => a - b);
}

// X-axis date ticks: first, middle, last logged-aware positions. Returns the
// point indices to label (deduped, ascending). For < 3 points it returns
// what's available. The label text is derived by the caller from the day at
// that index.
export function xTickIndices(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  if (count === 2) return [0, count - 1];
  return [0, Math.floor((count - 1) / 2), count - 1];
}

// A short "5 Jun"-style label for the X axis from a YYYY-MM-DD date string.
// Kept tiny and locale-stable (no weekday) so three ticks never overflow.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDateLabel(ymd: string): string {
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12) return ymd;
  return `${d} ${MONTHS[mo - 1]}`;
}

// The plotted vertical max — headroom over both the target and the data so
// the line never clips the top edge. Mirrors the chart's own max math.
export function plotMax(target: number, values: number[]): number {
  const valid = values.filter((v) => Number.isFinite(v));
  return Math.max(target * 1.5, ...valid, 1);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// The day-index → DayAggregate lookup the scrubber tooltip reads. The chart
// plots over the window's LOGGED-aware aggregates in order, so the same
// array the line was built from is indexed here.
export function dayAtIndex(window: DayAggregate[], index: number): DayAggregate | null {
  if (index < 0 || index >= window.length) return null;
  return window[index];
}

// Above this many days the per-day path is too dense to draw cleanly (a
// year is 365 points), so the chart decimates to weekly buckets. The
// threshold sits comfortably above the 3mo (90-day) selection so 7d/15d/
// 1mo/3mo stay per-day and only 1y buckets.
export const DECIMATE_THRESHOLD_DAYS = 120;

// Collapse a daily window into 7-day buckets for a large range (1y), so the
// SVG stays light. Each bucket carries the SUMMED nutrient totals over its
// logged days and a meal_count that is the bucket's logged-day COUNT — so a
// downstream rollingAverage still treats an all-empty bucket as a gap (NaN)
// and never pulls the line toward zero. The bucket's date is its first day
// (the X label reads the start of the week). Buckets are taken from the END
// (newest) backward so the most recent week is always a full, aligned bucket
// and any short bucket lands at the oldest edge.
//
// NOTE: weekly buckets average their member days' per-day values, so the
// chart of a 1y window reads as a weekly trend (noted on the chart as
// "weekly"). This is a display decimation only — the raw window is untouched.
export function decimateToWeekly(window: DayAggregate[]): DayAggregate[] {
  if (window.length === 0) return window;
  const buckets: DayAggregate[] = [];
  // Walk from the newest day backward in 7-day strides, then reverse so the
  // result stays chronological ascending (oldest → newest).
  for (let end = window.length; end > 0; end -= 7) {
    const start = Math.max(0, end - 7);
    const slice = window.slice(start, end);
    const loggedDays = slice.filter((d) => d.meal_count > 0);
    const n = loggedDays.length;
    const sum = (pick: (d: DayAggregate) => number) =>
      loggedDays.reduce((acc, d) => acc + pick(d), 0);
    const mean = (pick: (d: DayAggregate) => number) => (n ? sum(pick) / n : 0);
    buckets.push({
      // The bucket's anchor date is its first (oldest) day.
      date: slice[0].date,
      // meal_count = logged-day count for the week, so an all-empty week is
      // a genuine gap to the rolling-average pass downstream.
      meal_count: n,
      plant_pct: Math.round(mean((d) => d.plant_pct)),
      sat_fat_g: round1(mean((d) => d.sat_fat_g)),
      soluble_fiber_g: round1(mean((d) => d.soluble_fiber_g)),
      calories: Math.round(mean((d) => d.calories)),
      protein_g: round1(mean((d) => d.protein_g)),
      carbs_g: round1(mean((d) => d.carbs_g)),
      alcohol_g: round1(mean((d) => d.alcohol_g)),
      kcal_burn: null,
    });
  }
  return buckets.reverse();
}
