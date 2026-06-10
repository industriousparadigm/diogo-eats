// Week-grid assembly for the calendar heatmap — pure, testable.
// Port of the web CalendarHeatmap's buildWeekGrid: weeks as columns,
// days as rows (Sun..Sat), padded to full weeks, using the shared
// visible-window logic so calendar and trends show the same horizon.

import type { DayAggregate } from "./types";
import { visibleAggregates } from "./headline";

export type WeekGrid = {
  weeks: Array<Array<DayAggregate | null>>;
};

export function buildWeekGrid(aggs: DayAggregate[]): WeekGrid {
  const visible = visibleAggregates(aggs);
  if (visible.length === 0) return { weeks: [] };

  const byDate = new Map(visible.map((a) => [a.date, a]));
  const start = parseLocal(visible[0].date);
  const end = parseLocal(visible[visible.length - 1].date);

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

// Whether week wi should carry a month label: first column always; later
// columns when the previous week was a different month.
export function monthLabelFor(
  weeks: Array<Array<DayAggregate | null>>,
  wi: number
): number | null {
  const firstDay = weeks[wi]?.find((d) => d !== null);
  if (!firstDay) return null;
  const month = parseLocal(firstDay.date).getMonth();
  if (wi === 0) return month;
  const prevDay = weeks[wi - 1]?.find((d) => d !== null);
  if (!prevDay) return month;
  const prevMonth = parseLocal(prevDay.date).getMonth();
  return prevMonth !== month ? month : null;
}

function parseLocal(ymd: string): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
