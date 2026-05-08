import type { DayAggregate } from "./types";

// Derive the visible time window for the looking-back surface. Used by both
// the calendar heatmap and the sat-fat trend so they always show the same
// horizon — usually a couple of weeks for a fresh user, growing toward 12
// weeks as the log accumulates.
export function visibleAggregates(aggs: DayAggregate[]): DayAggregate[] {
  if (aggs.length === 0) return aggs;

  const earliestLogged = aggs.find((a) => a.meal_count > 0);
  if (!earliestLogged) {
    // No meals yet: show the last 7 days.
    return aggs.slice(-7);
  }

  // Start ~1 week before earliest log, capped at 84 days (12 weeks) back.
  const firstLogIdx = aggs.indexOf(earliestLogged);
  const bufferIdx = Math.max(0, firstLogIdx - 7);
  const capIdx = Math.max(0, aggs.length - 84);
  const startIdx = Math.max(bufferIdx, capIdx);
  return aggs.slice(startIdx);
}
