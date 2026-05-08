"use client";

import { useMemo } from "react";
import { colors, radii } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";
import { useTargets } from "@/lib/targets";
import { visibleAggregates } from "@/lib/window";

// Slow-moving line: 7-day rolling average of saturated fat over the visible
// window. Sat fat is the actual LDL mechanism — this shows trajectory
// without inviting daily verdicts. The target line is a soft reference, not
// a pass/fail gate.
//
// Renders only over the visible-window range (matches the calendar), so
// the path doesn't waste 80% of the canvas on pre-log empty days.
export function SatFatTrend({ aggregates }: { aggregates: DayAggregate[] }) {
  const targets = useTargets();
  const window = useMemo(() => visibleAggregates(aggregates), [aggregates]);
  const { points, max, hasData } = useMemo(() => {
    const smoothed: number[] = [];
    for (let i = 0; i < window.length; i++) {
      // 7-day rolling window looking back. Skips zeros from empty days so
      // a missed log doesn't pull the average to 0.
      const win: number[] = [];
      for (let j = Math.max(0, i - 6); j <= i; j++) {
        if (window[j].meal_count > 0) {
          win.push(window[j].sat_fat_g);
        }
      }
      smoothed.push(win.length ? avg(win) : NaN);
    }
    const validVals = smoothed.filter((v) => !isNaN(v));
    const max = Math.max(targets.sat_fat_g * 1.5, ...validVals, 1);
    return { points: smoothed, max, hasData: validVals.length > 0 };
  }, [window, targets.sat_fat_g]);

  // Need at least 2 logged days for a line to be meaningful.
  const validCount = points.filter((p) => !isNaN(p)).length;
  if (!hasData || validCount < 2) return null;

  const W = 100; // viewBox width in arbitrary units; scales with parent
  const H = 28;
  const xStep = W / Math.max(1, points.length - 1);

  // Build path skipping NaN gaps cleanly (move-to instead of line-to).
  const path = points.reduce((acc, v, i) => {
    if (isNaN(v)) return acc;
    const x = (i * xStep).toFixed(2);
    const y = (H - (v / max) * H).toFixed(2);
    const cmd = acc.endsWith("M") || acc === "" || acc.endsWith("Z")
      ? `M${x},${y}`
      : ` L${x},${y}`;
    // Special case: previous point was NaN — start a new sub-path.
    if (i > 0 && isNaN(points[i - 1])) return acc + ` M${x},${y}`;
    return acc + cmd;
  }, "");

  const targetY = H - (targets.sat_fat_g / max) * H;

  // Latest non-NaN value for the readout
  const latest = [...points].reverse().find((v) => !isNaN(v)) ?? 0;
  const overTarget = latest > targets.sat_fat_g;

  return (
    <div
      style={{
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.md,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: colors.textSubtle, letterSpacing: 0.5, fontWeight: 500 }}>
          SAT FAT · 7-DAY AVERAGE
        </div>
        <div
          style={{
            fontSize: 13,
            color: overTarget ? colors.warn : colors.accentLight,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
          }}
        >
          {latest.toFixed(1)}g
          <span style={{ color: colors.textFaint, marginLeft: 4, fontWeight: 400 }}>
            / {targets.sat_fat_g}g target
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 56, display: "block" }}
        aria-label="Saturated fat 7-day rolling average over the visible window"
      >
        {/* Soft target line */}
        <line
          x1={0}
          x2={W}
          y1={targetY}
          y2={targetY}
          stroke={colors.borderStrong}
          strokeWidth={0.5}
          strokeDasharray="1,1"
        />
        {/* The trend line itself */}
        <path
          d={path}
          fill="none"
          stroke={colors.accentLight}
          strokeWidth={1.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
