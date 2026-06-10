// Design tokens ported from lib/styles.ts on the web app.
// React Native doesn't use CSS, so these are plain JS objects.

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

  // Plant signal scale — single hue, no stoplight.
  plant: {
    none: "#1a1a1d",
    veryLow: "#2a2d22",
    low: "#3a4528",
    mid: "#52702f",
    high: "#669d34",
    full: "#84cc16",
  },

  // Warnings — used sparingly, not for daily verdicts.
  warn: "#fcd34d",
  bad: "#fca5a5",
  badStrong: "#dc2626",

  accent: "#65a30d",
  accentBright: "#a3e635",
  accentLight: "#bef264",
  brand: "#84cc16",
} as const;

export const radii = { sm: 8, md: 12, lg: 14, xl: 16 } as const;

// Plant color by percentage — single hue, no stoplight.
export function plantColor(pct: number, hasMeals: boolean): string {
  if (!hasMeals) return colors.plant.none;
  if (pct >= 90) return colors.plant.full;
  if (pct >= 70) return colors.plant.high;
  if (pct >= 50) return colors.plant.mid;
  if (pct >= 30) return colors.plant.low;
  return colors.plant.veryLow;
}
