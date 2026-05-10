import type { DayAggregate } from "./types";

// Build the one-sentence summary shown above the calendar heatmap.
//
// Pure function so we can test the rule table without rendering React or
// dealing with hooks. The component (`RollingHeadline`) is now just the
// presentation layer; this is the brain.
//
// Tone rules:
//   - Lead with what's WORKING — plant share + soluble fiber consistency
//   - Sat fat is mentioned only when it's noteworthy (clear delta vs the
//     prior 14 days, or clearly above target without prior context).
//   - Below 3 logged days, return null — the empty-state copy elsewhere
//     handles the "just getting started" framing better.
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

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
