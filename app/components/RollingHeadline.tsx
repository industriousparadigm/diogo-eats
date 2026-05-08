"use client";

import { useMemo } from "react";
import { colors, radii } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";
import { useTargets } from "@/lib/targets";

// Plain-English shape of the recent past. Rule-based, no LLM call —
// fast, free, and predictable. Speaks in identity-language ("you've been
// eating like X") not pass/fail ("you hit Y of your goals").
export function RollingHeadline({ aggregates }: { aggregates: DayAggregate[] }) {
  const targets = useTargets();
  const sentence = useMemo(() => buildHeadline(aggregates, targets.sat_fat_g), [aggregates, targets.sat_fat_g]);

  if (!sentence) return null;

  return (
    <div
      style={{
        padding: "16px 18px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.lg,
        fontSize: 16,
        lineHeight: 1.45,
        color: colors.text,
        letterSpacing: -0.1,
      }}
    >
      {sentence}
    </div>
  );
}

function buildHeadline(aggs: DayAggregate[], satFatTarget: number): string | null {
  // Need a meaningful sample. <3 logged days → return nothing; the empty
  // state copy elsewhere handles it.
  const logged = aggs.filter((a) => a.meal_count > 0);
  if (logged.length < 3) return null;

  const last14 = logged.slice(-14);
  const prev14 = logged.slice(-28, -14);

  const plantAvg = avg(last14.map((a) => a.plant_pct));
  const satFatAvg = avg(last14.map((a) => a.sat_fat_g));
  const prevSatFatAvg = prev14.length >= 3 ? avg(prev14.map((a) => a.sat_fat_g)) : null;

  const plantWord = plantAvg >= 75
    ? "Mostly plants"
    : plantAvg >= 55
    ? "Plant-leaning"
    : plantAvg >= 35
    ? "Mixed plates"
    : "Mostly animal-based";

  // Sat fat trend phrase — only if we have enough history to compare.
  let satPhrase = "";
  if (prevSatFatAvg !== null) {
    const diff = satFatAvg - prevSatFatAvg;
    const pctDiff = prevSatFatAvg > 0.5 ? Math.abs(diff / prevSatFatAvg) : 0;
    if (pctDiff < 0.08) {
      satPhrase = "Sat fat holding steady.";
    } else if (diff < 0) {
      satPhrase = "Sat fat trending down.";
    } else {
      satPhrase = "Sat fat ticking up.";
    }
  } else {
    // Compare to target if no prior window
    if (satFatAvg < satFatTarget * 0.7) {
      satPhrase = "Sat fat comfortably under target.";
    } else if (satFatAvg < satFatTarget) {
      satPhrase = "Sat fat near target.";
    } else {
      satPhrase = "Sat fat above target.";
    }
  }

  const range = last14.length === 1 ? "Yesterday" : `Last ${last14.length} logged days`;
  return `${range}: ${plantWord.toLowerCase()}. ${satPhrase}`;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
