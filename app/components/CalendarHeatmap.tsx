"use client";

import { useMemo } from "react";
import { colors, plantColor } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";
import type { Flag } from "@/lib/overview";
import { isPositiveFlag } from "@/lib/overview";
import { visibleAggregates } from "@/lib/window";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Fixed cell size in pixels. Without this, cells with `flex: 1` expand
// to fill the row when there are few weeks of data — a 2-week calendar
// became a wall of giant squares. 22px reads cleanly even on small
// screens and lets the calendar take its natural width.
const CELL = 22;
const CELL_GAP = 4;

// Heatmap of recent days, GitHub-contributions-shape: weeks as columns,
// days as rows. Color = plant %, semantic single-hue (cream → deep green).
//
// The visible window grows with usage:
//   - Always shows the current week.
//   - If you've logged meals, starts ~1 week before your earliest log.
//   - Caps at 12 weeks back so the grid doesn't sprawl long-term.
//
// Tap a cell to navigate to that day.
export function CalendarHeatmap({
  aggregates,
  onPickDate,
  selectedDate,
  flagsByDate,
  windowDays,
}: {
  aggregates: DayAggregate[];
  onPickDate: (ymd: string) => void;
  selectedDate?: string;
  // When provided, each day cell renders a tiny corner dot — green for
  // positive flags (plant-led, fiber-hit, etc.), amber for negative
  // (over-target sat fat). Lets the overview surface flag patterns
  // without changing the home calendar's behaviour.
  flagsByDate?: Map<string, Flag[]>;
  // Optional: when set, bypass the auto-window in visibleAggregates and
  // show exactly the last `windowDays` of the data passed in. The
  // overview page uses this to render the user-chosen window verbatim.
  windowDays?: number;
}) {
  const grid = useMemo(
    () => buildWeekGrid(aggregates, windowDays),
    [aggregates, windowDays]
  );

  if (grid.weeks.length === 0) return null;

  const numWeeks = grid.weeks.length;
  // Total grid width: day label column + week columns + their gaps.
  const gridWidth = 14 + 4 + numWeeks * CELL + (numWeeks - 1) * CELL_GAP;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      {/* Month labels above the columns. One per column where the month
          either starts or where the previous week was a different month. */}
      <div
        aria-hidden
        style={{
          display: "flex",
          gap: CELL_GAP,
          fontSize: 10,
          color: colors.textSubtle,
          letterSpacing: 0.4,
          height: 14,
          paddingLeft: 14 + 4, // align past the day-of-week label column
          width: gridWidth,
        }}
      >
        {grid.weeks.map((week, wi) => {
          const firstDay = week.find((d) => d !== null);
          if (!firstDay) return <div key={wi} style={{ width: CELL }} />;
          const date = new Date(firstDay.date + "T00:00:00");
          const showLabel =
            wi === 0 ||
            (wi > 0 && shouldStartMonthLabel(grid.weeks[wi - 1], date.getMonth()));
          return (
            <div
              key={wi}
              style={{
                width: CELL,
                textAlign: "left",
                whiteSpace: "nowrap",
                overflow: "visible",
              }}
            >
              {showLabel ? MONTH_NAMES[date.getMonth()] : ""}
            </div>
          );
        })}
      </div>

      <div
        role="grid"
        aria-label="Daily plant-percentage heatmap"
        style={{
          display: "flex",
          gap: CELL_GAP,
          alignItems: "stretch",
        }}
      >
        {/* Day-of-week labels column. All seven, dim, aligned to rows. */}
        <div
          aria-hidden
          style={{
            display: "flex",
            flexDirection: "column",
            gap: CELL_GAP,
            paddingRight: 4,
            fontSize: 9,
            color: colors.textFaint,
            letterSpacing: 0.4,
          }}
        >
          {DAY_LABELS.map((d, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: CELL,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                opacity: i % 2 === 1 ? 1 : 0.45, // brighter on M/W/F for rhythm
              }}
            >
              {d}
            </div>
          ))}
        </div>
        {grid.weeks.map((week, wi) => (
          <div
            key={wi}
            role="row"
            style={{ display: "flex", flexDirection: "column", gap: CELL_GAP }}
          >
            {week.map((cell, di) =>
              cell ? (
                <Cell
                  key={cell.date}
                  agg={cell}
                  selected={cell.date === selectedDate}
                  onPick={() => onPickDate(cell.date)}
                  flags={flagsByDate?.get(cell.date)}
                />
              ) : (
                <div
                  key={`empty-${wi}-${di}`}
                  aria-hidden
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 3,
                    background: "transparent",
                  }}
                />
              )
            )}
          </div>
        ))}
      </div>

      <Legend />
    </div>
  );
}

function Cell({
  agg,
  selected,
  onPick,
  flags,
}: {
  agg: DayAggregate;
  selected: boolean;
  onPick: () => void;
  flags?: Flag[];
}) {
  const hasMeals = agg.meal_count > 0;
  const bg = plantColor(agg.plant_pct, hasMeals);
  const date = new Date(agg.date + "T00:00:00");
  const friendly = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const baseLabel = hasMeals
    ? `${friendly}: ${agg.meal_count} meal${agg.meal_count === 1 ? "" : "s"}, ${agg.plant_pct}% plant`
    : `${friendly}: no meals`;
  // Negative flag wins precedence — if a day was both clean-ish and
  // over the fat target, the warning is the more useful signal.
  const negative = flags?.find((f) => !isPositiveFlag(f));
  const positive = flags?.find((f) => isPositiveFlag(f));
  const dotColor = negative
    ? colors.warn
    : positive
      ? colors.accentBright
      : null;
  const dotLabel = flags?.length ? ` · ${flags.join(", ")}` : "";
  return (
    <button
      role="gridcell"
      onClick={onPick}
      title={baseLabel + dotLabel}
      aria-label={baseLabel + dotLabel}
      style={{
        position: "relative",
        width: CELL,
        height: CELL,
        borderRadius: 3,
        background: bg,
        border: selected
          ? `2px solid ${colors.accentBright}`
          : `1px solid ${hasMeals ? "transparent" : colors.border}`,
        padding: 0,
        cursor: "pointer",
        transition: "transform 100ms ease, background 200ms ease",
      }}
    >
      {dotColor && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: dotColor,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      )}
    </button>
  );
}

function Legend() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        color: colors.textFaint,
        marginTop: 2,
      }}
    >
      <span>less plant</span>
      {[colors.plant.veryLow, colors.plant.low, colors.plant.mid, colors.plant.high, colors.plant.full].map(
        (c, i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: c,
              display: "inline-block",
            }}
          />
        )
      )}
      <span>more</span>
    </div>
  );
}

// Build the week-column grid for the visible window. Uses the same
// window-derivation logic as the trend line so the calendar and trend
// always show the same horizon. Pads to Sunday-Saturday boundaries so
// each column is a full week visually. When `windowDays` is set, takes
// the last N entries verbatim instead of running through visibleAggregates.
function buildWeekGrid(
  aggs: DayAggregate[],
  windowDays?: number
): {
  weeks: Array<Array<DayAggregate | null>>;
} {
  const visible = windowDays != null ? aggs.slice(-windowDays) : visibleAggregates(aggs);
  if (visible.length === 0) return { weeks: [] };

  const byDate = new Map(visible.map((a) => [a.date, a]));
  const start = new Date(visible[0].date + "T00:00:00");
  const end = new Date(visible[visible.length - 1].date + "T00:00:00");

  // Snap start back to its Sunday and end forward to its Saturday so each
  // column is a complete 7-cell week.
  const firstSunday = new Date(start);
  firstSunday.setDate(start.getDate() - start.getDay());
  const lastSaturday = new Date(end);
  lastSaturday.setDate(end.getDate() + (6 - end.getDay()));

  const weeks: Array<Array<DayAggregate | null>> = [];
  for (let d = new Date(firstSunday); d <= lastSaturday; ) {
    const week: Array<DayAggregate | null> = [];
    for (let i = 0; i < 7; i++) {
      const ymd = ymdOf(d);
      week.push(byDate.get(ymd) ?? null);
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks };
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shouldStartMonthLabel(prevWeek: Array<DayAggregate | null>, currMonth: number): boolean {
  const prevDay = prevWeek.find((d) => d !== null);
  if (!prevDay) return true;
  const prevMonth = new Date(prevDay.date + "T00:00:00").getMonth();
  return prevMonth !== currMonth;
}
