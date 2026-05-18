"use client";

import { useMemo, useState } from "react";
import { colors, radii } from "@/lib/styles";
import { prepDayBars, niceTicks, niceMax } from "@/lib/chartData";
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
//
// Optional `secondaryAccessor` renders a horizontal tick mark per bar
// at the secondary value's height — used to overlay Whoop kcal burn
// on the calories chart so the user can compare consumed vs burned at
// a glance. The chart's Y-max grows to include the secondary peak so
// nothing gets clipped.
export function DayBarChart({
  aggregates,
  title,
  accessor,
  target,
  direction,
  format,
  secondaryAccessor,
  secondaryLabel,
  amberAt,
  redAt,
}: {
  aggregates: DayAggregate[];
  title: string;
  accessor: (a: DayAggregate) => number;
  target?: number;
  direction: Direction;
  format: (v: number) => string;
  secondaryAccessor?: (a: DayAggregate) => number | null;
  secondaryLabel?: string;
  // Explicit thresholds for the bar color tiers, in the same units as
  // `accessor`. Override the generic multiplier-based defaults. Useful
  // when the chart's "red" should align with a domain-specific tier
  // boundary that isn't a clean multiple of the target — e.g. the
  // alcohol chart whose tiers (0 / >0 / >14 / >42) are tied to the
  // standard-drink scale and shouldn't move with the daily target.
  amberAt?: number;
  redAt?: number;
}) {
  const prepped = useMemo(
    () => prepDayBars(aggregates, accessor, target),
    [aggregates, accessor, target]
  );

  // Secondary series values per bar. null = no data for that day; we
  // skip rendering a tick rather than show a misleading zero.
  const secondaryValues = useMemo(() => {
    if (!secondaryAccessor) return null;
    return aggregates.map((a) => secondaryAccessor(a));
  }, [aggregates, secondaryAccessor]);

  // Adjust the chart's Y-max to fit the secondary peak too, otherwise
  // a high-burn day with a low-consumption day would render the tick
  // OUTSIDE the SVG viewBox.
  const effectiveMax = useMemo(() => {
    if (!secondaryValues) return prepped.max;
    const peak = secondaryValues.reduce<number>(
      (m, v) => (v != null && v > m ? v : m),
      0
    );
    if (peak <= prepped.max) return prepped.max;
    return niceMax(peak, target);
  }, [secondaryValues, prepped.max, target]);

  const ticks = useMemo(() => niceTicks(effectiveMax), [effectiveMax]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (!prepped.hasData) return null;

  const onGoodSide =
    target == null
      ? true
      : direction === "above_good"
        ? prepped.latest >= target
        : prepped.latest <= target;
  const valueColor = onGoodSide ? colors.accentLight : colors.warn;

  const W = 100;
  const H = 60;
  const yAxisGutter = 0;
  const barCount = prepped.bars.length;
  const barSlot = W / barCount;
  const gapRatio = barCount > 30 ? 0.35 : barCount > 14 ? 0.3 : 0.22;
  const barWidth = barSlot * (1 - gapRatio);
  const minBarHeight = 0.6;

  // Active-bar readout: show both consumed and burned when secondary
  // exists.
  const activeBar = activeIdx != null ? prepped.bars[activeIdx] : null;
  const activeSecondary =
    activeIdx != null && secondaryValues ? secondaryValues[activeIdx] : null;

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
          {activeBar ? (
            <>
              <span style={{ color: colors.textFaint, marginRight: 6, fontWeight: 400 }}>
                {longDay(activeBar.date)}
              </span>
              {activeBar.logged ? format(activeBar.value) : "no log"}
              {activeSecondary != null && (
                <span style={{ color: SECONDARY_COLOR, marginLeft: 6, fontWeight: 400 }}>
                  · burn {format(activeSecondary)}
                </span>
              )}
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
            {ticks.slice(1, -1).map((t, i) => {
              const y = H - (t / effectiveMax) * H;
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
            {prepped.targetRatio != null && (
              <line
                x1={yAxisGutter}
                x2={W}
                y1={H - (target! / effectiveMax) * H}
                y2={H - (target! / effectiveMax) * H}
                stroke={colors.accentBright}
                strokeWidth={0.5}
                strokeDasharray="2,2"
                opacity={0.7}
              />
            )}
            {prepped.bars.map((b, i) => {
              const x = i * barSlot + (barSlot - barWidth) / 2;
              const ratio = effectiveMax > 0 ? b.value / effectiveMax : 0;
              const rawH = ratio * H;
              const h = b.logged && b.value > 0 ? Math.max(rawH, 0.6) : minBarHeight;
              const y = H - h;
              let fill: string;
              if (!b.logged) {
                fill = colors.border;
              } else if (target == null) {
                fill = colors.accent;
              } else if (direction === "below_good") {
                const amberCutoff = amberAt ?? target * AMBER_OVER;
                const redCutoff = redAt ?? target * RED_OVER;
                if (b.value > redCutoff) fill = colors.badStrong;
                else if (b.value > amberCutoff) fill = colors.warn;
                else fill = colors.accent;
              } else {
                const amberCutoff = amberAt ?? target * AMBER_UNDER;
                const redCutoff = redAt ?? target * RED_UNDER;
                if (b.value > 0 && b.value < redCutoff) fill = colors.badStrong;
                else if (b.value > 0 && b.value < amberCutoff) fill = colors.warn;
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
            {/* Secondary series: small horizontal tick per bar at the
                burn value's y position. Rendered AFTER bars so it sits
                on top. Skip when null (no Whoop data that day). */}
            {secondaryValues &&
              prepped.bars.map((b, i) => {
                const v = secondaryValues[i];
                if (v == null) return null;
                const y = H - (v / effectiveMax) * H;
                const tickW = Math.min(barSlot * 0.95, barWidth + 1.2);
                const cx = i * barSlot + barSlot / 2;
                return (
                  <line
                    key={`tick-${i}`}
                    x1={cx - tickW / 2}
                    x2={cx + tickW / 2}
                    y1={y}
                    y2={y}
                    stroke={SECONDARY_COLOR}
                    strokeWidth={1}
                    strokeLinecap="round"
                  />
                );
              })}
          </svg>

          {/* HTML overlay for the target label. SVG <text> warps under
              preserveAspectRatio="none"; HTML doesn't, so the label
              stays sharp at every aspect. */}
          {prepped.targetRatio != null && target != null && (
            <div
              style={{
                position: "absolute",
                right: 4,
                top: `calc(${(1 - target / effectiveMax) * 100}% - 14px)`,
                fontSize: 9,
                color: colors.accentBright,
                background: "rgba(10,10,10,0.85)",
                padding: "1px 6px",
                borderRadius: 4,
                fontWeight: 500,
                letterSpacing: 0.2,
                fontVariantNumeric: "tabular-nums",
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              target {format(target)}
            </div>
          )}

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

      {secondaryValues && secondaryLabel && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: colors.textFaint,
            letterSpacing: 0.3,
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 12,
              height: 2,
              background: SECONDARY_COLOR,
              borderRadius: 1,
            }}
          />
          <span>{secondaryLabel}</span>
        </div>
      )}
    </div>
  );
}

function shortDay(ymd: string | undefined): string {
  if (!ymd) return "";
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function longDay(ymd: string | undefined): string {
  if (!ymd) return "";
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

// Cyan-ish — distinct from bar fills (green/yellow/red) and the target
// line (accent bright). Reads as "energy / activity" without competing
// for attention.
const SECONDARY_COLOR = "#67e8f9";
