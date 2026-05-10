"use client";

import type { Meal } from "@/lib/types";
import { useTargets } from "@/lib/targets";

// One-liner above the pulse showing what kind of day it is.
//
// Tone is the entire point: lead with WHAT'S WORKING (plant share, fiber).
// Sat fat earns a callout only when meaningfully over (≥120% of target).
// Single bites of cheese must NEVER turn the headline into a verdict.
export function DailyHeadline({
  meals,
  totals,
  plantPct,
  isToday,
  viewDate,
}: {
  meals: Meal[];
  totals: {
    sat_fat_g: number;
    soluble_fiber_g: number;
    calories: number;
    protein_g: number;
  };
  plantPct: number;
  isToday: boolean;
  viewDate: Date;
}) {
  const targets = useTargets();
  if (meals.length === 0) {
    return (
      <div
        style={{
          padding: "18px 18px",
          marginBottom: 12,
          fontSize: 16,
          color: "#a1a1aa",
          background: "#0f0f10",
          border: "1px solid #1f1f22",
          borderRadius: 14,
        }}
      >
        {isToday ? "Nothing yet today." : "Nothing logged that day."}
      </div>
    );
  }

  const wins: string[] = [];
  if (plantPct >= 80) wins.push("Plant-led day");
  else if (plantPct >= 60) wins.push("Plant-leaning");
  else if (plantPct >= 40) wins.push("Mixed plate");
  else wins.push("Animal-led day");

  const fiber = totals.soluble_fiber_g;
  if (fiber >= targets.soluble_fiber_g) wins.push(`${fiber.toFixed(0)}g soluble fiber`);
  else if (fiber >= targets.soluble_fiber_g * 0.5)
    wins.push(`${fiber.toFixed(0)}g fiber so far`);

  const satRatio = totals.sat_fat_g / targets.sat_fat_g;
  const fatNote = satRatio >= 1.2 ? "Sat fat well over target" : null;

  const mealLabel = meals.length === 1 ? "1 meal" : `${meals.length} meals`;
  const dayPart = isToday
    ? "today"
    : viewDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

  // Lead color reflects plant signal. Mixed plates stay neutral white,
  // not yellow — yellow felt judgmental.
  const leadColor = plantPct >= 60 ? "#a3e635" : plantPct >= 40 ? "#e4e4e7" : "#fca5a5";

  return (
    <div
      style={{
        padding: "18px 18px",
        marginBottom: 12,
        background: "#0f0f10",
        border: "1px solid #1f1f22",
        borderRadius: 14,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: leadColor,
          lineHeight: 1.25,
          letterSpacing: -0.3,
        }}
      >
        {wins.join(". ")}
        {wins.length ? "." : ""}
      </div>
      {fatNote && (
        <div style={{ fontSize: 13, color: "#fcd34d", marginTop: 6 }}>{fatNote}</div>
      )}
      <div style={{ fontSize: 12, color: "#52525b", marginTop: 10, letterSpacing: 0.3 }}>
        {mealLabel.toUpperCase()} · {dayPart.toUpperCase()}
      </div>
    </div>
  );
}
