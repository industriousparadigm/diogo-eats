"use client";

import type React from "react";
import { colors, radii } from "@/lib/styles";
import type { Targets } from "@/lib/targets";
import type { Averages } from "@/lib/overview";

type Tone = "good" | "neutral" | "warn";

// Hero block for the overview page. Three layers:
//   1. Tiny meta: window length, days logged, total entries (coverage signal).
//   2. The summary sentence (rule-based, no LLM).
//   3. Four tiles — plant / fiber / sat fat / calories, each averaged over
//      the logged days in the window. Tone color is the read.
export function OverviewHero({
  sentence,
  averages,
  targets,
  windowDays,
}: {
  sentence: string;
  averages: Averages;
  targets: Targets;
  windowDays: number;
}) {
  const plantTone: Tone = averages.plant_pct >= 60 ? "good" : "neutral";
  const fiberTone: Tone =
    averages.soluble_fiber_g >= targets.soluble_fiber_g
      ? "good"
      : averages.soluble_fiber_g >= targets.soluble_fiber_g * 0.6
        ? "neutral"
        : "warn";
  const satFatTone: Tone =
    averages.sat_fat_g <= targets.sat_fat_g
      ? "good"
      : averages.sat_fat_g <= targets.sat_fat_g * 1.2
        ? "neutral"
        : "warn";

  const noData = averages.logged_days === 0;

  return (
    <section style={hero}>
      <div style={meta}>
        LAST {windowDays} DAYS · {averages.logged_days} LOGGED · {averages.total_logs}{" "}
        {averages.total_logs === 1 ? "ENTRY" : "ENTRIES"}
      </div>
      <div style={sentenceStyle}>{sentence}</div>
      {noData ? null : (
      <div style={grid}>
        <Tile
          label="Plant"
          value={`${Math.round(averages.plant_pct)}%`}
          sub="of intake"
          tone={plantTone}
        />
        <Tile
          label="Soluble fiber"
          value={`${averages.soluble_fiber_g.toFixed(1)}g`}
          sub={`/ ${targets.soluble_fiber_g}g/day`}
          tone={fiberTone}
        />
        <Tile
          label="Sat fat"
          value={`${averages.sat_fat_g.toFixed(1)}g`}
          sub={`/ ${targets.sat_fat_g}g/day`}
          tone={satFatTone}
        />
        <Tile
          label="Calories"
          value={`${Math.round(averages.calories)}`}
          sub="kcal/day"
          tone="neutral"
        />
      </div>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
}) {
  const valColor =
    tone === "good" ? colors.accentLight : tone === "warn" ? colors.warn : colors.text;
  return (
    <div style={tile}>
      <div style={tileLabel}>{label.toUpperCase()}</div>
      <div style={{ ...tileValue, color: valColor }}>{value}</div>
      <div style={tileSub}>{sub}</div>
    </div>
  );
}

const hero: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const meta: React.CSSProperties = {
  fontSize: 10,
  color: colors.textSubtle,
  letterSpacing: 1.2,
  fontWeight: 500,
};
const sentenceStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1.3,
  color: colors.text,
  letterSpacing: -0.3,
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};
const tile: React.CSSProperties = {
  background: colors.surfaceAlt,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
const tileLabel: React.CSSProperties = {
  fontSize: 10,
  color: colors.textSubtle,
  letterSpacing: 0.5,
  fontWeight: 500,
};
const tileValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.1,
};
const tileSub: React.CSSProperties = {
  fontSize: 11,
  color: colors.textFaint,
  letterSpacing: 0.3,
};
