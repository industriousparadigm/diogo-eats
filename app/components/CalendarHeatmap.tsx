"use client";

import { useMemo } from "react";
import { colors, plantColor, radii } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";

// 12-week heatmap, GitHub-contributions-shape: weeks as columns, days as rows.
// Color = plant %, semantic single-hue. Empty days show as a dim cell, not
// missing — so the user sees "didn't log" without it feeling like a verdict.
//
// Tap a cell to navigate to that day's meals.
export function CalendarHeatmap({
  aggregates,
  onPickDate,
  selectedDate,
}: {
  aggregates: DayAggregate[];
  onPickDate: (ymd: string) => void;
  selectedDate?: string;
}) {
  // Build a Sunday-aligned week grid. The end of the data is "today"; we
  // pad the trailing Sunday-Saturday week with disabled cells so the
  // most recent column has a consistent height even mid-week.
  const grid = useMemo(() => buildWeekGrid(aggregates), [aggregates]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        role="grid"
        aria-label="12-week food log calendar"
        style={{
          display: "flex",
          gap: 4,
          alignItems: "stretch",
        }}
      >
        {/* Weekday labels (M, W, F) on the left for orientation */}
        <div
          aria-hidden
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            paddingRight: 4,
            fontSize: 9,
            color: colors.textFaint,
            letterSpacing: 0.5,
          }}
        >
          <span>M</span>
          <span>W</span>
          <span>F</span>
        </div>
        {grid.weeks.map((week, wi) => (
          <div
            key={wi}
            role="row"
            style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}
          >
            {week.map((cell, di) =>
              cell ? (
                <Cell
                  key={cell.date}
                  agg={cell}
                  selected={cell.date === selectedDate}
                  onPick={() => onPickDate(cell.date)}
                />
              ) : (
                <div
                  key={`empty-${wi}-${di}`}
                  aria-hidden
                  style={{
                    aspectRatio: "1",
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
}: {
  agg: DayAggregate;
  selected: boolean;
  onPick: () => void;
}) {
  const hasMeals = agg.meal_count > 0;
  const bg = plantColor(agg.plant_pct, hasMeals);
  const label = `${agg.date}: ${
    hasMeals ? `${agg.meal_count} meal${agg.meal_count === 1 ? "" : "s"}, ${agg.plant_pct}% plant` : "no meals"
  }`;
  return (
    <button
      role="gridcell"
      onClick={onPick}
      title={label}
      aria-label={label}
      style={{
        aspectRatio: "1",
        borderRadius: 3,
        background: bg,
        border: selected
          ? `2px solid ${colors.accentBright}`
          : `1px solid ${hasMeals ? "transparent" : colors.border}`,
        padding: 0,
        cursor: "pointer",
        transition: "transform 100ms ease, background 200ms ease",
      }}
    />
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

// Shape the linear day list into 7-row columns where each column is a
// Sunday-Saturday week. The first column may have leading nulls (days
// before the data start), and the last column may have trailing nulls
// (days after today). We draw the nulls as transparent placeholders so
// the rectangle stays clean.
function buildWeekGrid(aggs: DayAggregate[]): {
  weeks: Array<Array<DayAggregate | null>>;
} {
  if (aggs.length === 0) return { weeks: [] };

  // Index by date for fast lookup. Map preserves insertion order.
  const byDate = new Map(aggs.map((a) => [a.date, a]));

  const start = new Date(aggs[0].date + "T00:00:00");
  const end = new Date(aggs[aggs.length - 1].date + "T00:00:00");

  // Walk back to Sunday of the first week and forward to Saturday of the
  // last week, building 7-day columns.
  const firstSunday = new Date(start);
  firstSunday.setDate(start.getDate() - start.getDay());
  const lastSaturday = new Date(end);
  lastSaturday.setDate(end.getDate() + (6 - end.getDay()));

  const weeks: Array<Array<DayAggregate | null>> = [];
  for (let d = new Date(firstSunday); d <= lastSaturday; ) {
    const week: Array<DayAggregate | null> = [];
    for (let i = 0; i < 7; i++) {
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      week.push(byDate.get(ymd) ?? null);
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks };
}
