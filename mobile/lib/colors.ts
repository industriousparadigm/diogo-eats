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

  // Strength scoreboard — a deliberately different emotional contract
  // from food. Food stays celebration-free (identity language, single
  // green hue); strength IS a scoreboard: beats, streaks, bold
  // color-per-exercise cards. Amber is the scoreboard's brand hue so it
  // never reads as the food green.
  strength: {
    brand: "#f59e0b",
    brandBright: "#fbbf24",
    brandDim: "rgba(245,158,11,0.14)",
  },
} as const;

// Bold per-exercise accents for the strength cards (the day-1 PDF look:
// color-per-exercise, chunky borders). Keyed by exercise id with a
// stable rotation fallback for anything beyond the seeded five.
const EXERCISE_ACCENTS: Record<string, string> = {
  "leg-press": "#f59e0b", // amber
  "back-extension": "#38bdf8", // sky
  "chest-press": "#f472b6", // pink
  "seated-row": "#a78bfa", // violet
  "farmers-carry": "#2dd4bf", // teal
};

const ACCENT_ROTATION = ["#f59e0b", "#38bdf8", "#f472b6", "#a78bfa", "#2dd4bf"];

export function exerciseAccent(exerciseId: string): string {
  if (EXERCISE_ACCENTS[exerciseId]) return EXERCISE_ACCENTS[exerciseId];
  let hash = 0;
  for (let i = 0; i < exerciseId.length; i++) {
    hash = (hash * 31 + exerciseId.charCodeAt(i)) >>> 0;
  }
  return ACCENT_ROTATION[hash % ACCENT_ROTATION.length];
}

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
