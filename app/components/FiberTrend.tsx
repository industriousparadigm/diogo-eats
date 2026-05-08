"use client";

import { useMemo } from "react";
import { colors, radii } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";
import { useTargets } from "@/lib/targets";
import { visibleAggregates } from "@/lib/window";

// Mirror of SatFatTrend, but for soluble fiber — the underrated lever for
// LDL reduction. Where sat fat is "the thing to keep below," fiber is
// "the thing to keep above" — visualizing both together makes the user
// feel both sides of the equation, not just the warning side.
//
// Same rendering pattern as SatFatTrend: 7-day rolling avg over the
// visible window, soft target line, latest value readout.
export function FiberTrend({ aggregates }: { aggregates: DayAggregate[] }) {
  const targets = useTargets();
  const window = useMemo(() => visibleAggregates(aggregates), [aggregates]);
  const { points, max, hasData } = useMemo(() => {
    const smoothed: number[] = [];
    for (let i = 0; i < window.length; i++) {
      const win: number[] = [];
      for (let j = Math.max(0, i - 6); j <= i; j++) {
        if (window[j].meal_count > 0) win.push(window[j].soluble_fiber_g);
      }
      smoothed.push(win.length ? avg(win) : NaN);
    }
    const validVals = smoothed.filter((v) => !isNaN(v));
    const max = Math.max(targets.soluble_fiber_g * 1.5, ...validVals, 1);
    return { points: smoothed, max, hasData: validVals.length > 0 };
  }, [window, targets.soluble_fiber_g]);

  const validCount = points.filter((p) => !isNaN(p)).length;
  if (!hasData || validCount < 2) return null;

  const W = 100;
  const H = 50;
  const xStep = W / Math.max(1, points.length - 1);

  const path = points.reduce((acc, v, i) => {
    if (isNaN(v)) return acc;
    const x = (i * xStep).toFixed(2);
    const y = (H - (v / max) * H).toFixed(2);
    if (i > 0 && isNaN(points[i - 1])) return acc + ` M${x},${y}`;
    return acc === "" ? `M${x},${y}` : acc + ` L${x},${y}`;
  }, "");

  const targetY = H - (targets.soluble_fiber_g / max) * H;
  const latest = [...points].reverse().find((v) => !isNaN(v)) ?? 0;
  // For fiber, ABOVE target is the win — color logic is inverted vs sat fat.
  const aboveTarget = latest >= targets.soluble_fiber_g;

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
          SOLUBLE FIBER · 7-DAY AVERAGE
        </div>
        <div
          style={{
            fontSize: 13,
            color: aboveTarget ? colors.accentLight : colors.textMuted,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
          }}
        >
          {latest.toFixed(1)}g
          <span style={{ color: colors.textFaint, marginLeft: 4, fontWeight: 400 }}>
            / {targets.soluble_fiber_g}g target
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 110, display: "block" }}
        aria-label="Soluble fiber 7-day rolling average"
      >
        <line
          x1={0}
          x2={W}
          y1={targetY}
          y2={targetY}
          stroke={colors.borderStrong}
          strokeWidth={0.4}
          strokeDasharray="1,1"
        />
        <path
          d={path}
          fill="none"
          stroke={colors.accentLight}
          strokeWidth={1}
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
