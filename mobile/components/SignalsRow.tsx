// SIGNALS · THIS WINDOW — the day-level signals card on the looking-back
// surface (overview item 4). Honest COUNTS over the selected window, never
// grades. Food register: calm, neutral ink, no celebration, no red, no
// stoplight. The number is the point (condensed numeral), the label is a
// plain noun phrase, and a quiet "of M" gives the denominator so a count
// reads as a fact, not a score.
//
// The "fully plant" signal wears the food lime on its numeral — it's the
// one celebrated lever (plant share is what the looking-back surface leads
// with). Everything else stays neutral text; alcohol is NOT red — it's a
// fact, not a sin (food constitution).

import { View, Text, StyleSheet } from "react-native";
import { palette, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card, SectionHeader } from "@/components/ui";
import type { Signal } from "@/lib/signals";

export function SignalsRow({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;
  return (
    <Card tone="recessed" style={styles.card}>
      <SectionHeader>SIGNALS · THIS WINDOW</SectionHeader>
      <View style={styles.grid}>
        {signals.map((s) => (
          <View key={s.key} style={styles.cell}>
            <View style={styles.numRow}>
              <Text
                style={[
                  styles.count,
                  // The celebrated lever wears the lime; the rest stay calm.
                  s.key === "fully_plant" && { color: palette.food.accentBright },
                ]}
              >
                {s.count}
              </Text>
              <Text style={styles.of}>of {s.of}</Text>
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.md,
  },
  // Two-up grid: each cell takes half the row so 3-4 signals wrap cleanly.
  cell: {
    width: "50%",
    paddingRight: spacing.sm,
    gap: 1,
  },
  numRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  count: {
    fontFamily: condensedFamily,
    fontSize: fontSize.displayLg,
    fontWeight: "800",
    color: palette.text,
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.3 : -0.4,
  },
  of: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    fontVariant: ["tabular-nums"],
  },
  label: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    lineHeight: 16,
  },
});
