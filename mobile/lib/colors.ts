// Compatibility shim. The design system now lives in lib/theme.ts.
//
// This file re-exports the legacy `colors` / `radii` / `exerciseAccent` /
// `plantColor` surface so existing imports keep working while screens migrate
// onto the theme tokens. New code should import from "@/lib/theme".
//
// `colors` maps the old flat names onto the new palette so values stay
// consistent across both import paths (and colors.test.ts keeps passing).

import { palette, radii as themeRadii, exerciseAccent, plantColor } from "./theme";

export const colors = {
  bg: palette.bg,
  surface: palette.surface,
  surfaceAlt: palette.surfaceAlt,
  surfaceMuted: palette.surfaceMuted,
  border: palette.hairline,
  borderStrong: palette.inkSoft,
  borderDashed: palette.borderDashed,

  text: palette.text,
  textMuted: palette.textMuted,
  textSubtle: palette.textSubtle,
  textFaint: palette.textFaint,

  // Plant signal scale — single hue, no stoplight.
  plant: palette.plant,

  // Warnings — used sparingly, not for daily verdicts.
  warn: palette.warn,
  bad: palette.danger,
  badStrong: palette.dangerStrong,

  accent: palette.food.accentDeep,
  accentBright: palette.food.accentBright,
  accentLight: "#bef264",
  brand: palette.food.accent,

  // Strength scoreboard — a deliberately different emotional contract.
  strength: {
    brand: palette.strength.brand,
    brandBright: palette.strength.brandBright,
    brandDim: palette.strength.brandSoft,
  },
} as const;

export const radii = themeRadii;

export { exerciseAccent, plantColor };
