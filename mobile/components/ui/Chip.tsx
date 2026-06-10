// Chip — a small pill of metadata (kcal badge, plant %, beats count, vibe,
// provenance, confidence). The card's playful element.
//
// Variants:
//   tone="neutral"  inset gray chip (kcal, secondary metadata)
//   tone="accent"   tinted fill in a color identity (plant %, vibe, beats)
//   tone="outline"  just a bordered chip (repeat, mini-actions)
//
// `rotated` gives the ±1.5° tilt from the print card — use SPARINGLY, on
// standalone accent chips only (a tilted row of badges reads as broken).
// `fill` overrides the background; `borderColor`/`textColor` fine-tune.

import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { palette, radii, borders, fontSize, rotate } from "@/lib/theme";

type Props = {
  label: string;
  tone?: "neutral" | "accent" | "outline";
  // For accent/outline tones: the identity color (border + text).
  identity?: string;
  // Explicit background fill (e.g. the plant scale color on a meal badge).
  fill?: string;
  // Explicit text color (e.g. white-on-dark plant badge).
  textColor?: string;
  rotated?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Chip({
  label,
  tone = "neutral",
  identity,
  fill,
  textColor,
  rotated = false,
  accessibilityLabel,
  style,
}: Props) {
  const accent = identity ?? palette.food.accent;

  const toneStyle: ViewStyle =
    tone === "accent"
      ? { backgroundColor: fill ?? palette.food.accentSoft, borderColor: accent, borderWidth: borders.hairline }
      : tone === "outline"
        ? { backgroundColor: "transparent", borderColor: accent, borderWidth: borders.hairline }
        : { backgroundColor: fill ?? palette.surfaceMuted, borderColor: palette.inkSoft, borderWidth: borders.hairline };

  const resolvedText =
    textColor ??
    (tone === "accent" || tone === "outline" ? accent : palette.textMuted);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.chip,
        toneStyle,
        rotated && { transform: [{ rotate: rotate.chip }] },
        fill ? { backgroundColor: fill } : null,
        style,
      ]}
    >
      <Text style={[styles.text, { color: resolvedText }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: fontSize.label,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
