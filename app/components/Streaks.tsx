"use client";

import type React from "react";
import { colors, radii } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";
import type { Targets } from "@/lib/targets";
import { longestStreak } from "@/lib/overview";

// Three narrative streaks. Computed over the visible window only — the
// numbers shift as the user changes the toggle, so "longest plant-led
// streak (this month)" can be different from "this quarter."
export function Streaks({
  aggregates,
  targets,
}: {
  aggregates: DayAggregate[];
  targets: Targets;
}) {
  const plant = longestStreak(aggregates, (a) => a.plant_pct >= 80);
  const fiber = longestStreak(aggregates, (a) => a.soluble_fiber_g >= targets.soluble_fiber_g);
  const lowSat = longestStreak(aggregates, (a) => a.sat_fat_g <= targets.sat_fat_g);

  return (
    <div style={card}>
      <div style={title}>STREAKS · LONGEST RUN IN WINDOW</div>
      <div style={rowsWrap}>
        <Row label="Plant-led (≥80%)" days={plant.length} />
        <Row label="Fiber on target" days={fiber.length} />
        <Row label="Sat fat at or under" days={lowSat.length} />
      </div>
    </div>
  );
}

function Row({ label, days }: { label: string; days: number }) {
  const hot = days >= 3;
  return (
    <div style={row}>
      <span style={rowLabel}>{label}</span>
      <span style={{ ...rowValue, color: hot ? colors.accentLight : colors.textMuted }}>
        {days} {days === 1 ? "day" : "days"}
      </span>
    </div>
  );
}

const card: React.CSSProperties = {
  background: colors.surfaceAlt,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const title: React.CSSProperties = {
  fontSize: 11,
  color: colors.textSubtle,
  letterSpacing: 0.5,
  fontWeight: 500,
};
const rowsWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  fontSize: 14,
};
const rowLabel: React.CSSProperties = {
  color: colors.textMuted,
};
const rowValue: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontWeight: 500,
};
