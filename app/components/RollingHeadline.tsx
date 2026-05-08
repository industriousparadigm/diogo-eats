"use client";

import { useMemo } from "react";
import { colors, radii } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";
import { useTargets } from "@/lib/targets";

// Plain-English shape of the recent past. Rule-based, no LLM call —
// fast, free, and predictable.
//
// Tone: lead with what's WORKING for LDL (plant share, fiber consistency),
// then sat fat as an add-on phrase. Earlier versions buried wins under
// fat-target framing; the user's correction was that the app shamed bad
// and never celebrated good. This rebalance tries to celebrate first.
export function RollingHeadline({ aggregates }: { aggregates: DayAggregate[] }) {
  const targets = useTargets();
  const sentence = useMemo(
    () => buildHeadline(aggregates, targets),
    [aggregates, targets]
  );

  if (!sentence) return null;

  return (
    <div
      style={{
        padding: "16px 18px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.lg,
        fontSize: 16,
        lineHeight: 1.5,
        color: colors.text,
        letterSpacing: -0.1,
      }}
    >
      {sentence}
    </div>
  );
}

type T = { sat_fat_g: number; soluble_fiber_g: number };

function buildHeadline(aggs: DayAggregate[], targets: T): string | null {
  const logged = aggs.filter((a) => a.meal_count > 0);
  if (logged.length < 3) return null;

  const last14 = logged.slice(-14);
  const prev14 = logged.slice(-28, -14);

  const plantAvg = avg(last14.map((a) => a.plant_pct));
  const fiberAvg = avg(last14.map((a) => a.soluble_fiber_g));
  const fiberDays = last14.filter((a) => a.soluble_fiber_g >= targets.soluble_fiber_g).length;
  const satFatAvg = avg(last14.map((a) => a.sat_fat_g));
  const prevSatFatAvg = prev14.length >= 3 ? avg(prev14.map((a) => a.sat_fat_g)) : null;

  // ---- lead: identity phrase about plant share ----
  const plantWord =
    plantAvg >= 80
      ? "Mostly plant-based"
      : plantAvg >= 60
      ? "Plant-leaning"
      : plantAvg >= 40
      ? "Mixed plates"
      : "Mostly animal-based";

  // ---- fiber win — celebrate when consistent ----
  let fiberPhrase: string | null = null;
  if (fiberDays >= last14.length * 0.7) {
    fiberPhrase = `fiber on track most days`;
  } else if (fiberAvg >= targets.soluble_fiber_g * 0.7) {
    fiberPhrase = `fiber close to target`;
  } else if (fiberAvg >= targets.soluble_fiber_g * 0.4) {
    fiberPhrase = `room for more soluble fiber`;
  } else {
    fiberPhrase = `fiber low — oats, beans, psyllium help`;
  }

  // ---- sat fat trend — only mention when noteworthy ----
  let satPhrase: string | null = null;
  if (prevSatFatAvg !== null && prevSatFatAvg > 0.5) {
    const diff = satFatAvg - prevSatFatAvg;
    const pctDiff = Math.abs(diff / prevSatFatAvg);
    if (pctDiff >= 0.15) {
      satPhrase = diff < 0 ? "sat fat trending down" : "sat fat ticking up";
    }
  } else if (satFatAvg >= targets.sat_fat_g * 1.3) {
    // Without a prior window, only mention if clearly over target.
    satPhrase = "sat fat above target";
  }

  const range = `Last ${last14.length} logged days`;
  const parts = [plantWord.toLowerCase(), fiberPhrase];
  if (satPhrase) parts.push(satPhrase);
  return `${range}: ${parts.filter(Boolean).join("; ")}.`;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
