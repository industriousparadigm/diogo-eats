"use client";

import { useMemo } from "react";
import { colors, radii } from "@/lib/styles";
import { prepDayBars, niceTicks } from "@/lib/chartData";
import type { DayAggregate } from "@/lib/types";

type Direction = "above_good" | "below_good";

// Per-day bar chart with a labeled Y-axis and target reference line.
// Replaces the 7-day-rolling line that washed out actual variation.
//
// Layout:
//   - Header row: title + latest value vs target
//   - Plot: bars (one per day) with Y-axis ticks on the left and a
//     dashed target line if a target is supplied
//   - X-axis micro labels show the first / middle / last day for context
//
// onPickDate is fired when the user taps a bar — routes to the day view.
export function DayBarChart({
  aggregates,
  title,
  accessor,
  target,
  direction,
  format,
  onPickDate,
}: {
  aggregates: DayAggregate[];
  title: string;
  accessor: (a: DayAggregate) => number;
  target?: number;
  direction: Direction;
  format: (v: number) => string;
  onPickDate?: (ymd: string) => void;
}) {
  const prepped = useMemo(
    () => prepDayBars(aggregates, accessor, target),
    [aggregates, accessor, target]
  );
  const ticks = useMemo(() => niceTicks(prepped.max), [prepped.max]);

  if (!prepped.hasData) return null;

  const onGoodSide =
    target == null
      ? true
      : direction === "above_good"
        ? prepped.latest >= target
        : prepped.latest <= target;
  const valueColor = onGoodSide ? colors.accentLight : colors.warn;

  // Chart geometry (viewBox units; the SVG itself stretches via width=100%).
  const W = 100;
  const H = 60;
  const yAxisGutter = 0; // ticks drawn outside the plot area via labels overlay
  const barCount = prepped.bars.length;
  const barSlot = W / barCount;
  // Slim bars with gap; tweak gap ratio so 7-day windows feel chunkier
  // than 90-day ones automatically (fewer bars = thicker visual).
  const gapRatio = barCount > 30 ? 0.35 : barCount > 14 ? 0.3 : 0.22;
  const barWidth = barSlot * (1 - gapRatio);
  const minBarHeight = 0.6; // px in viewBox — keeps unlogged days visible

  return (
    <div
      style={{
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.md,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
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
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: valueColor,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
          }}
        >
          {format(prepped.latest)}
          {target != null && (
            <span
              style={{ color: colors.textFaint, marginLeft: 4, fontWeight: 400 }}
            >
              / {format(target)} target
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontSize: 9,
            color: colors.textFaint,
            paddingTop: 2,
            paddingBottom: 14,
            minWidth: 30,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {[...ticks].reverse().map((t, i) => (
            <div key={i}>{format(t)}</div>
          ))}
        </div>

        <div style={{ flex: 1, position: "relative" }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: "100%", height: 110, display: "block" }}
            aria-label={`${title} per-day chart`}
          >
            {/* Faint horizontal gridlines at each tick (skip 0) */}
            {ticks.slice(1, -1).map((t, i) => {
              const y = H - (t / prepped.max) * H;
              return (
                <line
                  key={`grid-${i}`}
                  x1={yAxisGutter}
                  x2={W}
                  y1={y}
                  y2={y}
                  stroke={colors.border}
                  strokeWidth={0.3}
                />
              );
            })}
            {/* Target reference line */}
            {prepped.targetRatio != null && (
              <line
                x1={yAxisGutter}
                x2={W}
                y1={H - prepped.targetRatio * H}
                y2={H - prepped.targetRatio * H}
                stroke={colors.borderStrong}
                strokeWidth={0.5}
                strokeDasharray="1.2,1.2"
              />
            )}
            {/* Bars */}
            {prepped.bars.map((b, i) => {
              const x = i * barSlot + (barSlot - barWidth) / 2;
              const rawH = b.ratio * H;
              const h = b.logged && b.value > 0 ? Math.max(rawH, 0.6) : minBarHeight;
              const y = H - h;
              // Color: unlogged → very faint; over target on the "bad" side → warn; else accent
              const fill = !b.logged
                ? colors.border
                : target != null &&
                    ((direction === "below_good" && b.value > target * 1.1) ||
                      (direction === "above_good" && b.value < target * 0.5 && b.value > 0))
                  ? colors.warn
                  : colors.accent;
              return (
                <rect
                  key={b.date}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  fill={fill}
                  rx={Math.min(0.5, barWidth / 4)}
                  style={{ cursor: onPickDate ? "pointer" : "default" }}
                  onClick={() => onPickDate?.(b.date)}
                />
              );
            })}
          </svg>

          {/* X-axis day labels: first / middle / last only — keeps it readable */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 9,
              color: colors.textFaint,
              marginTop: 4,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>{shortDay(prepped.bars[0]?.date)}</span>
            {prepped.bars.length > 4 && (
              <span>{shortDay(prepped.bars[Math.floor(prepped.bars.length / 2)]?.date)}</span>
            )}
            <span>{shortDay(prepped.bars[prepped.bars.length - 1]?.date)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function shortDay(ymd: string | undefined): string {
  if (!ymd) return "";
  // "2026-05-14" → "5/14"
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
}
