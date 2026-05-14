"use client";

import { useMemo } from "react";
import { colors, radii } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";

type Direction = "above_good" | "below_good";

// Generalized 7-day-rolling line chart. The home page's FiberTrend and
// SatFatTrend are baked-in versions of this with hardcoded accessors;
// they stay as-is so home's behaviour doesn't shift. This is the
// flexible variant the overview page uses for all four metrics.
export function MetricTrend({
  aggregates,
  title,
  accessor,
  target,
  direction,
  format,
}: {
  aggregates: DayAggregate[];
  title: string;
  accessor: (a: DayAggregate) => number;
  target?: number;
  direction: Direction;
  // Caller-provided formatter so the same component handles g / % / kcal.
  format: (v: number) => string;
}) {
  const { points, max, hasData } = useMemo(() => {
    const smoothed: number[] = [];
    for (let i = 0; i < aggregates.length; i++) {
      const win: number[] = [];
      for (let j = Math.max(0, i - 6); j <= i; j++) {
        if (aggregates[j].meal_count > 0) win.push(accessor(aggregates[j]));
      }
      smoothed.push(win.length ? mean(win) : NaN);
    }
    const validVals = smoothed.filter((v) => !isNaN(v));
    const maxCandidate = target ? target * 1.5 : 0;
    const max = Math.max(maxCandidate, ...validVals, 1);
    return { points: smoothed, max, hasData: validVals.length > 0 };
  }, [aggregates, accessor, target]);

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

  const latest = [...points].reverse().find((v) => !isNaN(v)) ?? 0;
  const onGoodSide =
    target == null
      ? true
      : direction === "above_good"
        ? latest >= target
        : latest <= target;
  const lineColor = onGoodSide ? colors.accentLight : colors.warn;
  const targetY = target != null ? H - (target / max) * H : null;

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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: colors.textSubtle,
            letterSpacing: 0.5,
            fontWeight: 500,
          }}
        >
          {title} · 7-DAY AVG
        </div>
        <div
          style={{
            fontSize: 13,
            color: onGoodSide ? colors.accentLight : colors.textMuted,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
          }}
        >
          {format(latest)}
          {target != null && (
            <span
              style={{ color: colors.textFaint, marginLeft: 4, fontWeight: 400 }}
            >
              / {format(target)} target
            </span>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 110, display: "block" }}
        aria-label={`${title} 7-day rolling average`}
      >
        {targetY != null && (
          <line
            x1={0}
            x2={W}
            y1={targetY}
            y2={targetY}
            stroke={colors.borderStrong}
            strokeWidth={0.4}
            strokeDasharray="1,1"
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={lineColor}
          strokeWidth={1}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
