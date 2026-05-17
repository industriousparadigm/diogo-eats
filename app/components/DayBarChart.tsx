"use client";

import { useMemo, useState } from "react";
import { colors, radii } from "@/lib/styles";
import { prepDayBars, niceTicks } from "@/lib/chartData";
import type { DayAggregate } from "@/lib/types";

type Direction = "above_good" | "below_good";

// Thresholds (multiples of target) at which a "below_good" metric turns
// from green to amber, and amber to red. Calories at 110% target is
// still close; at 150% it's clearly over. For above_good metrics the
// inversion (% UNDER) is symmetric.
const AMBER_OVER = 1.1;
const RED_OVER = 1.5;
const AMBER_UNDER = 0.5;
const RED_UNDER = 0.25;

// Per-day bar chart with a labeled Y-axis and target reference line.
// Replaces the 7-day-rolling line that washed out actual variation.
//
// Layout:
//   - Header row: title + latest value vs target (OR active bar's date
//     + exact value when one is selected)
//   - Plot: bars (one per day) with Y-axis ticks on the left and a
//     dashed target line if a target is supplied
//   - X-axis micro labels show the first / middle / last day for context
//
// Interaction: bars are tap-to-inspect only. Tapping a bar selects it
// and surfaces its exact date + value above the chart. Tapping the
// same bar again deselects. No navigation away from /overview —
// leaving the page is intentional via the page's back buttons.
export function DayBarChart({
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
  format: (v: number) => string;
}) {
  const prepped = useMemo(
    () => prepDayBars(aggregates, accessor, target),
    [aggregates, accessor, target]
  );
  const ticks = useMemo(() => niceTicks(prepped.max), [prepped.max]);
  // Tap-to-inspect: which bar (if any) is currently selected? Tapping a
  // bar surfaces its exact date + value above the chart; tapping it
  // again navigates to that day via `onPickDate`.
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

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
            color: activeIdx != null ? colors.text : valueColor,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
          }}
        >
          {activeIdx != null ? (
            <>
              <span style={{ color: colors.textFaint, marginRight: 6, fontWeight: 400 }}>
                {longDay(prepped.bars[activeIdx]?.date)}
              </span>
              {prepped.bars[activeIdx]?.logged
                ? format(prepped.bars[activeIdx].value)
                : "no log"}
            </>
          ) : (
            <>
              {format(prepped.latest)}
              {target != null && (
                <span
                  style={{ color: colors.textFaint, marginLeft: 4, fontWeight: 400 }}
                >
                  / {format(target)} target
                </span>
              )}
            </>
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
            {/* Target reference line — solid + accent-tinted so it reads
                as a real "you want to be here" marker, not a decoration. */}
            {prepped.targetRatio != null && (
              <>
                <line
                  x1={yAxisGutter}
                  x2={W}
                  y1={H - prepped.targetRatio * H}
                  y2={H - prepped.targetRatio * H}
                  stroke={colors.accentBright}
                  strokeWidth={0.5}
                  strokeDasharray="2,2"
                  opacity={0.7}
                />
              </>
            )}
            {/* Bars */}
            {prepped.bars.map((b, i) => {
              const x = i * barSlot + (barSlot - barWidth) / 2;
              const rawH = b.ratio * H;
              const h = b.logged && b.value > 0 ? Math.max(rawH, 0.6) : minBarHeight;
              const y = H - h;
              // Three-tone semantic fill. Tightened red threshold per
              // Diogo's feedback: 2k cal target → 4k+ shouldn't read as
              // "just a little over" amber; it should read alarming.
              let fill: string;
              if (!b.logged) {
                fill = colors.border;
              } else if (target == null) {
                fill = colors.accent;
              } else if (direction === "below_good") {
                if (b.value > target * RED_OVER) fill = colors.badStrong;
                else if (b.value > target * AMBER_OVER) fill = colors.warn;
                else fill = colors.accent;
              } else {
                // above_good — fiber/plant: undershooting is bad
                if (b.value > 0 && b.value < target * RED_UNDER) fill = colors.badStrong;
                else if (b.value > 0 && b.value < target * AMBER_UNDER) fill = colors.warn;
                else fill = colors.accent;
              }
              const isActive = activeIdx === i;
              return (
                <rect
                  key={b.date}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  fill={fill}
                  rx={Math.min(0.5, barWidth / 4)}
                  opacity={isActive ? 1 : activeIdx == null ? 1 : 0.55}
                  style={{ cursor: "pointer" }}
                  onClick={() => setActiveIdx((cur) => (cur === i ? null : i))}
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

function longDay(ymd: string | undefined): string {
  if (!ymd) return "";
  // "2026-05-14" → "Thu May 14"
  const [yy, mm, dd] = ymd.split("-").map(Number);
  const d = new Date(yy, mm - 1, dd);
  return d
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
}
