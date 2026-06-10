// Eats design system — the single source of truth for every visual token.
//
// THE DNA (read mobile/DESIGN.md for the full story): this app's look is
// translated from a print artifact Diogo loves — a neobrutalist gym card.
// Its language is colored chunky ink borders + HARD offset shadow blocks
// (shadow as a solid colored rectangle behind the card, never a blur),
// one color identity per item, big condensed display numerals, and the
// occasional playful rotated chip. We render that DNA onto OLED black.
//
// TWO REGISTERS, ONE LANGUAGE:
//   - FOOD = the calm register. Sage/green family, identity language, no
//     celebration. Soft offset shadows, restrained color.
//   - STRENGTH = the loud register. The five bold exercise colors, beats
//     language, heavier offset shadows. Same borders, same shadow recipe,
//     same numerals — just turned up.
//
// Everything below is a token. Components must not hardcode hexes, widths,
// or font sizes — pull from here so the whole app moves together.

import { Platform, type TextStyle } from "react-native";

// ---------------------------------------------------------------------------
// PALETTE
// ---------------------------------------------------------------------------

export const palette = {
  // Background layers — OLED black up through raised surfaces.
  bg: "#0a0a0a", // app background — true near-black for OLED at 06:30 / dinner
  surface: "#161618", // a raised card
  surfaceAlt: "#0f0f10", // a recessed / secondary card
  surfaceMuted: "#18181b", // input fields, inset chips
  surfaceShadow: "#000000", // the hard offset-shadow block's neutral base

  // Borders. `ink` is the dark-world equivalent of the card's 2.5px ink
  // line — the default chunky border when a surface has no color identity.
  ink: "#3a3a40", // the neutral chunky border (food cards at rest)
  inkSoft: "#27272a", // a quieter chunky border (recessed cards)
  hairline: "#1f1f22", // 1px dividers, table rules — never a card edge
  borderDashed: "#3f3f46", // dashed affordances (add-item, compose entry)

  // Text — all four tiers verified legible on bg/surface. Never use
  // textFaint for anything a user must READ; it's for decorative hints only.
  text: "#f4f4f5",
  textMuted: "#b4b4bb", // secondary copy, still comfortably readable
  textSubtle: "#85858f", // labels, captions
  textFaint: "#5c5c66", // decorative hints, placeholders only

  // FOOD register — sage / cream / green. The calm family.
  food: {
    accent: "#84cc16", // the lime brand — food's identity color
    accentBright: "#a3e635",
    accentDeep: "#65a30d",
    accentSoft: "rgba(132,204,22,0.14)", // tint fills (vibe pill, mergeselect)
    cream: "#e8e6cf", // a warm off-white for food display numerals
  },

  // PLANT signal scale — single hue, cream -> deep green. No stoplight.
  // This is inviolable on the food side (protect-the-nudge).
  plant: {
    none: "#1a1a1d",
    veryLow: "#2a2d22",
    low: "#3a4528",
    mid: "#52702f",
    high: "#669d34",
    full: "#84cc16",
  },

  // STRENGTH register — the loud family. Amber is the scoreboard brand so
  // it never reads as the food green.
  strength: {
    brand: "#f59e0b",
    brandBright: "#fbbf24",
    brandSoft: "rgba(245,158,11,0.16)",
  },

  // Semantic — used sparingly. NEVER red on a food surface (a bad-food bite
  // must never alarm). Amber warn is the strongest a food surface may go.
  warn: "#fcd34d", // sat-fat-over-target, backfill day hint
  danger: "#f87171", // destructive actions + genuine errors ONLY (not food verdicts)
  dangerStrong: "#dc2626", // delete confirmation fill

  // Pure black/white for text-on-accent (the card prints black ink on color).
  onAccent: "#0a0a0a",
  white: "#ffffff",
} as const;

// Per-exercise color identities — the five bold accents from the gym card,
// keyed by exercise id with a stable rotation for any beyond the seeded five.
// Each has a `soft` tint for fills (the pastel sibling on dark).
const EXERCISE_ACCENTS: Record<string, { accent: string; soft: string }> = {
  "leg-press": { accent: "#f59e0b", soft: "rgba(245,158,11,0.16)" }, // amber
  "back-extension": { accent: "#38bdf8", soft: "rgba(56,189,248,0.16)" }, // sky
  "chest-press": { accent: "#f472b6", soft: "rgba(244,114,182,0.16)" }, // pink
  "seated-row": { accent: "#a78bfa", soft: "rgba(167,139,250,0.16)" }, // violet
  "farmers-carry": { accent: "#2dd4bf", soft: "rgba(45,212,191,0.16)" }, // teal
};

const ACCENT_ROTATION = [
  { accent: "#f59e0b", soft: "rgba(245,158,11,0.16)" },
  { accent: "#38bdf8", soft: "rgba(56,189,248,0.16)" },
  { accent: "#f472b6", soft: "rgba(244,114,182,0.16)" },
  { accent: "#a78bfa", soft: "rgba(167,139,250,0.16)" },
  { accent: "#2dd4bf", soft: "rgba(45,212,191,0.16)" },
];

export function exerciseAccent(exerciseId: string): string {
  return exerciseIdentity(exerciseId).accent;
}

export function exerciseIdentity(exerciseId: string): { accent: string; soft: string } {
  if (EXERCISE_ACCENTS[exerciseId]) return EXERCISE_ACCENTS[exerciseId];
  let hash = 0;
  for (let i = 0; i < exerciseId.length; i++) {
    hash = (hash * 31 + exerciseId.charCodeAt(i)) >>> 0;
  }
  return ACCENT_ROTATION[hash % ACCENT_ROTATION.length];
}

// ---------------------------------------------------------------------------
// BORDERS + RADII
// ---------------------------------------------------------------------------

export const borders = {
  // The chunky ink border. 2 is "present", 2.5 is "the card's signature".
  // RN renders fractional widths fine; we keep the card edge at 2.5.
  chunky: 2.5,
  bold: 2, // confirmed states, steppers
  hairline: 1, // dividers, inputs, mini-chips — never a primary card edge
} as const;

export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 999,
} as const;

// ---------------------------------------------------------------------------
// SHADOWS — the offset block. This is the heart of the look.
// ---------------------------------------------------------------------------
//
// A hard offset shadow: a SOLID block behind the card, down-right, no blur
// (shadowRadius 0). On dark we tint it with the card's own identity color so
// it reads as a colored "print register" rather than a generic drop shadow.
// `elevation` is Android's analogue (it can't do zero-blur offset; we accept
// the platform's soft shadow there).
//
// Use offsetShadow(color, size) to build the style. `size` picks the block
// depth: "soft" (food, restrained) or "loud" (strength, assertive).

type ShadowStyle = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

const SHADOW_DEPTH = {
  soft: { width: 3, height: 3, opacity: 0.55, elevation: 4 },
  loud: { width: 4, height: 4, opacity: 0.85, elevation: 7 },
} as const;

export function offsetShadow(
  color: string = palette.surfaceShadow,
  depth: keyof typeof SHADOW_DEPTH = "soft"
): ShadowStyle {
  const d = SHADOW_DEPTH[depth];
  return {
    shadowColor: color,
    shadowOffset: { width: d.width, height: d.height },
    shadowOpacity: d.opacity,
    shadowRadius: 0, // HARD block — never blur
    elevation: d.elevation,
  };
}

// ---------------------------------------------------------------------------
// TYPOGRAPHY
// ---------------------------------------------------------------------------
//
// The card's numbers are Phosphate / Avenir Next Condensed — big, condensed,
// confident. iOS ships "Avenir Next Condensed" as a system family, so we use
// it directly for DISPLAY NUMERALS (totals, LAST/BEST, kcal, weights/reps).
// No font-loading dependency. On non-iOS we fall back to the system face with
// heavy weight + tight tracking, which keeps the "big number" intent.
//
// Body / headings stay on the system font (San Francisco on iOS) — clean,
// legible, and the right neutral against the loud numerals.

export const condensedFamily = Platform.select({
  ios: "Avenir Next Condensed",
  default: undefined, // system face; weight + letterSpacing carry the look
}) as string | undefined;
const CONDENSED = condensedFamily;

// Font sizes — one scale, referenced by name so nothing drifts.
export const fontSize = {
  micro: 9,
  tiny: 10,
  label: 11,
  caption: 12,
  body: 14,
  bodyLg: 15,
  title: 16,
  lead: 18,
  display: 22, // screen titles, the big totals
  displayLg: 28,
  hero: 34, // sign-in logo, highlight lead
} as const;

// Reusable text token presets. Spread these into StyleSheet text styles.
export const typography: Record<
  | "displayNumber"
  | "displayNumberLg"
  | "screenTitle"
  | "sectionHeader"
  | "body"
  | "bodyMuted"
  | "statLabel",
  TextStyle
> = {
  // Big condensed display numeral — for anything where the NUMBER is the
  // point. Pair with a color from the relevant register.
  displayNumber: {
    fontFamily: CONDENSED,
    fontSize: fontSize.display,
    fontWeight: "800" as const,
    letterSpacing: CONDENSED ? 0.3 : -0.5,
    fontVariant: ["tabular-nums" as const],
  },
  displayNumberLg: {
    fontFamily: CONDENSED,
    fontSize: fontSize.displayLg,
    fontWeight: "800" as const,
    letterSpacing: CONDENSED ? 0.4 : -0.6,
    fontVariant: ["tabular-nums" as const],
  },
  // Screen title (e.g. "Today", "Looking back", "Strength", "Settings").
  screenTitle: {
    fontSize: fontSize.display,
    fontWeight: "800" as const,
    color: palette.text,
    letterSpacing: -0.5,
  },
  // The letterspaced uppercase section header ("THE NUMBERS TO BEAT").
  sectionHeader: {
    fontSize: fontSize.label,
    fontWeight: "700" as const,
    letterSpacing: 1.4,
    textTransform: "uppercase" as const,
    color: palette.textSubtle,
  },
  // Standard readable body.
  body: {
    fontSize: fontSize.body,
    color: palette.text,
    lineHeight: 20,
  },
  bodyMuted: {
    fontSize: fontSize.body,
    color: palette.textMuted,
    lineHeight: 20,
  },
  // A small stat label under a display number ("KCAL", "PROTEIN").
  statLabel: {
    fontSize: fontSize.tiny,
    fontWeight: "700" as const,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    color: palette.textSubtle,
  },
};

// ---------------------------------------------------------------------------
// SPACING — one 4-based scale.
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// Playful rotation accents (degrees) — applied sparingly to chips / labels,
// echoing the card's ±1-2° tilt. Cards themselves stay upright on mobile
// (a tilted scroll list reads as broken, not playful).
export const rotate = {
  chip: "-1.5deg",
  chipAlt: "1.5deg",
} as const;

// ---------------------------------------------------------------------------
// PLANT COLOR — single hue, no stoplight (food side, inviolable).
// ---------------------------------------------------------------------------

export function plantColor(pct: number, hasMeals: boolean): string {
  if (!hasMeals) return palette.plant.none;
  if (pct >= 90) return palette.plant.full;
  if (pct >= 70) return palette.plant.high;
  if (pct >= 50) return palette.plant.mid;
  if (pct >= 30) return palette.plant.low;
  return palette.plant.veryLow;
}

// One bundled export for ergonomic imports.
export const theme = {
  palette,
  borders,
  radii,
  fontSize,
  typography,
  spacing,
  rotate,
  offsetShadow,
  exerciseAccent,
  exerciseIdentity,
  plantColor,
} as const;
