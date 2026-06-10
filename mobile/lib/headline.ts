// Rolling headline — the one-sentence summary above the calendar.
//
// PORTED VERBATIM from the web app's lib/rolling-headline.ts so both
// surfaces tell the same story. Pure function, rule-based, no LLM.
//
// Tone rules:
//   - Lead with what's WORKING — plant share + soluble fiber consistency
//   - Sat fat is mentioned only when it's noteworthy (clear delta vs the
//     prior 14 days, or clearly above target without prior context).
//   - Below 3 logged days, return null — empty-state copy elsewhere
//     handles the "just getting started" framing better.

import type { DayAggregate } from "./types";

export type HeadlineTargets = {
  sat_fat_g: number;
  soluble_fiber_g: number;
};

export function buildHeadline(
  aggs: DayAggregate[],
  targets: HeadlineTargets
): string | null {
  const logged = aggs.filter((a) => a.meal_count > 0);
  if (logged.length < 3) return null;

  const last14 = logged.slice(-14);
  const prev14 = logged.slice(-28, -14);

  const plantAvg = avg(last14.map((a) => a.plant_pct));
  const fiberAvg = avg(last14.map((a) => a.soluble_fiber_g));
  const fiberDays = last14.filter(
    (a) => a.soluble_fiber_g >= targets.soluble_fiber_g
  ).length;
  const satFatAvg = avg(last14.map((a) => a.sat_fat_g));
  const prevSatFatAvg =
    prev14.length >= 3 ? avg(prev14.map((a) => a.sat_fat_g)) : null;

  const plantWord =
    plantAvg >= 80
      ? "Mostly plant-based"
      : plantAvg >= 60
      ? "Plant-leaning"
      : plantAvg >= 40
      ? "Mixed plates"
      : "Mostly animal-based";

  let fiberPhrase: string;
  if (fiberDays >= last14.length * 0.7) {
    fiberPhrase = "fiber on track most days";
  } else if (fiberAvg >= targets.soluble_fiber_g * 0.7) {
    fiberPhrase = "fiber close to target";
  } else if (fiberAvg >= targets.soluble_fiber_g * 0.4) {
    fiberPhrase = "room for more soluble fiber";
  } else {
    fiberPhrase = "fiber low — oats, beans, psyllium help";
  }

  // Sat fat phrase — only if there's something noteworthy to say.
  let satPhrase: string | null = null;
  if (prevSatFatAvg !== null && prevSatFatAvg > 0.5) {
    const diff = satFatAvg - prevSatFatAvg;
    const pctDiff = Math.abs(diff / prevSatFatAvg);
    if (pctDiff >= 0.15) {
      satPhrase = diff < 0 ? "sat fat trending down" : "sat fat ticking up";
    }
  } else if (satFatAvg >= targets.sat_fat_g * 1.3) {
    satPhrase = "sat fat above target";
  }

  const range = `Last ${last14.length} logged days`;
  const parts: string[] = [plantWord.toLowerCase(), fiberPhrase];
  if (satPhrase) parts.push(satPhrase);
  return `${range}: ${parts.join("; ")}.`;
}

// Derive the visible time window for the looking-back surface — same
// logic as the web's lib/window.ts so calendar and trends share a
// horizon: a couple of weeks for a fresh log, growing toward 12 weeks.
export function visibleAggregates(aggs: DayAggregate[]): DayAggregate[] {
  if (aggs.length === 0) return aggs;

  const earliestLogged = aggs.find((a) => a.meal_count > 0);
  if (!earliestLogged) {
    return aggs.slice(-7);
  }

  const firstLogIdx = aggs.indexOf(earliestLogged);
  const bufferIdx = Math.max(0, firstLogIdx - 7);
  const capIdx = Math.max(0, aggs.length - 84);
  const startIdx = Math.max(bufferIdx, capIdx);
  return aggs.slice(startIdx);
}

// 7-day rolling average over the visible window, skipping unlogged days
// so a missed log doesn't pull the average toward 0. NaN where the
// trailing window has no logged days at all. Shared by both trend charts.
export function rollingAverage(
  window: DayAggregate[],
  pick: (a: DayAggregate) => number
): number[] {
  const smoothed: number[] = [];
  for (let i = 0; i < window.length; i++) {
    const win: number[] = [];
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      if (window[j].meal_count > 0) win.push(pick(window[j]));
    }
    smoothed.push(win.length ? avg(win) : NaN);
  }
  return smoothed;
}

// Coverage-honest averages: only logged days count, and the caller is
// told how many that was so the UI can say so.
export type LoggedAverages = {
  loggedDays: number;
  plant_pct: number;
  soluble_fiber_g: number;
  sat_fat_g: number;
  calories: number;
  protein_g: number;
};

export function loggedAverages(aggs: DayAggregate[], lastN = 14): LoggedAverages {
  const logged = aggs.filter((a) => a.meal_count > 0).slice(-lastN);
  return {
    loggedDays: logged.length,
    plant_pct: avg(logged.map((a) => a.plant_pct)),
    soluble_fiber_g: avg(logged.map((a) => a.soluble_fiber_g)),
    sat_fat_g: avg(logged.map((a) => a.sat_fat_g)),
    calories: avg(logged.map((a) => a.calories)),
    protein_g: avg(logged.map((a) => a.protein_g)),
  };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
