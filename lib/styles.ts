// Shared design tokens + component styles. Centralizing so the looking-back
// surface and existing surfaces stay visually coherent without scattering
// hex codes everywhere.

import type React from "react";

export const colors = {
  bg: "#0a0a0a",
  surface: "#161618",
  surfaceAlt: "#0f0f10",
  surfaceMuted: "#18181b",
  border: "#1f1f22",
  borderStrong: "#27272a",
  borderDashed: "#3f3f46",

  text: "#f4f4f5",
  textMuted: "#a1a1aa",
  textSubtle: "#71717a",
  textFaint: "#52525b",

  // Plant signal scale — single hue, no stoplight. Light cream to deep green.
  // Designed so a glance reads "rhythm" not "judgment".
  plant: {
    none: "#1a1a1d", // empty cell, slightly above bg so it has presence
    veryLow: "#2a2d22", // <30%
    low: "#3a4528", // 30-50%
    mid: "#52702f", // 50-70%
    high: "#669d34", // 70-90%
    full: "#84cc16", // 90-100%
  },

  // Reserved for "watch the fat" type alerts. Used sparingly — not
  // for daily verdicts.
  warn: "#fcd34d",
  bad: "#fca5a5",
  badStrong: "#dc2626",

  accent: "#65a30d",
  accentBright: "#a3e635",
  accentLight: "#bef264",
  brand: "#84cc16",
};

export const radii = { sm: 8, md: 12, lg: 14, xl: 16 };

export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: colors.surfaceMuted,
  color: colors.text,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.sm,
  padding: "12px 14px",
  fontSize: 16,
  outline: "none",
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  lineHeight: 1.4,
  minHeight: 44,
  resize: "none",
};

export function plantColor(pct: number, hasMeals: boolean): string {
  if (!hasMeals) return colors.plant.none;
  if (pct >= 90) return colors.plant.full;
  if (pct >= 70) return colors.plant.high;
  if (pct >= 50) return colors.plant.mid;
  if (pct >= 30) return colors.plant.low;
  return colors.plant.veryLow;
}
