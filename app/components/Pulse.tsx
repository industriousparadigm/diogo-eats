"use client";

import { useTargets } from "@/lib/targets";

// Today's at-a-glance pulse. Order matters: plant + fiber lead, sat fat
// follows, calories + protein round it out. The order reinforces "what's
// helping LDL is the lede, not what to watch."
//
// Each stat scales its bar to its target but never red-alerts on day-of
// (only the inverted "sat fat" stat tints red when over target).
export function Pulse({
  totals,
  plantPct,
  mealCount: _mealCount,
}: {
  totals: { sat_fat_g: number; soluble_fiber_g: number; calories: number; protein_g: number };
  plantPct: number;
  mealCount: number;
}) {
  const targets = useTargets();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        background: "#161618",
        padding: 18,
        borderRadius: 14,
      }}
    >
      <Stat label="plant" value={String(plantPct)} unit="%" target={100} />
      <Stat
        label="soluble fiber"
        value={totals.soluble_fiber_g.toFixed(1)}
        unit="g"
        target={targets.soluble_fiber_g}
      />
      <Stat
        label="sat fat"
        value={totals.sat_fat_g.toFixed(1)}
        unit="g"
        target={targets.sat_fat_g}
        invert
      />
      <Stat
        label="calories"
        value={Math.round(totals.calories).toString()}
        unit=""
        target={targets.calories}
      />
      <Stat
        label="protein"
        value={totals.protein_g.toFixed(0)}
        unit="g"
        target={targets.protein_g}
        fullSpan
      />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  target,
  invert,
  subtle,
  fullSpan,
}: {
  label: string;
  value: string;
  unit: string;
  target: number;
  invert?: boolean;
  subtle?: string;
  fullSpan?: boolean;
}) {
  const num = parseFloat(value) || 0;
  const pct = Math.min(100, (num / target) * 100);
  const over = invert ? num > target : false;
  return (
    <div style={{ gridColumn: fullSpan ? "span 2" : undefined }}>
      <div
        style={{
          fontSize: 10,
          color: "#71717a",
          letterSpacing: 0.8,
          marginBottom: 6,
          fontWeight: 500,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: over ? "#fca5a5" : "#f4f4f5",
          letterSpacing: -0.5,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
        <span style={{ fontSize: 13, color: "#71717a", marginLeft: 3, fontWeight: 400, letterSpacing: 0 }}>
          {unit}
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: "#27272a",
          marginTop: 8,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: over ? "#dc2626" : "#65a30d",
            transition: "width 400ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
      {subtle && <div style={{ fontSize: 10, color: "#52525b", marginTop: 4 }}>{subtle}</div>}
    </div>
  );
}
