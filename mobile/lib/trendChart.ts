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
