// MovementRhythm — the "am I moving, or slacking?" glance that the flat
// timeline buried. A 7-wide calendar grid of the last 28 days: a filled cell
// (strength amber) for a day you moved, a hollow cell for a day you didn't.
// Density reads instantly as a streak or a gap. Today wears a ring.
//
// One flat loud Card (a supporting glance — the offset block stays the
// rollup cards' signal, per DESIGN.md "Depth rules"). The cells are plain
// Views (interiors are spacing, never their own border/block).

import { View, Text, StyleSheet } from "react-native";
import { palette, radii, borders, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card } from "@/components/ui";
import type { RhythmDay } from "@/lib/movementRollup";

const COLS = 7; // a week per row

export function MovementRhythm({
  rhythm,
  activeDays,
  movements,
}: {
  rhythm: RhythmDay[];
  activeDays: number;
  movements: number;
}) {
  // Chunk oldest→newest into rows of 7 so it reads like weeks stacked.
  const rows: RhythmDay[][] = [];
  for (let i = 0; i < rhythm.length; i += COLS) rows.push(rhythm.slice(i, i + COLS));

  return (
    <Card
      flat
      depth="loud"
      style={styles.card}
      accessibilityLabel={`moved ${activeDays} of ${rhythm.length} days`}
    >
      <View style={styles.header}>
        <Text style={styles.title}>LAST {rhythm.length} DAYS</Text>
        <Text style={styles.caption}>
          <Text style={styles.captionStrong}>{activeDays}</Text> active ·{" "}
          <Text style={styles.captionStrong}>{movements}</Text> moved
        </Text>
      </View>
      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((d) => (
              <View
                key={d.key}
                style={[
                  styles.cell,
                  d.active ? styles.cellActive : styles.cellIdle,
                  d.today && styles.cellToday,
                ]}
              />
            ))}
            {/* pad a short final row so cells keep their column width */}
            {row.length < COLS &&
              Array.from({ length: COLS - row.length }).map((_, k) => (
                <View key={`pad-${k}`} style={styles.cellPad} />
              ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  title: {
    fontSize: fontSize.micro,
    fontWeight: "800",
    color: palette.textSubtle,
    letterSpacing: 0.8,
  },
  caption: { fontSize: fontSize.caption, color: palette.textMuted, fontWeight: "600" },
  captionStrong: {
    fontFamily: condensedFamily,
    color: palette.strength.brandBright,
    fontWeight: "800",
  },
  grid: { gap: 5 },
  row: { flexDirection: "row", gap: 5 },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.xs,
    maxHeight: 18,
  },
  cellPad: { flex: 1, aspectRatio: 1, maxHeight: 18 },
  cellActive: { backgroundColor: palette.strength.brand },
  cellIdle: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: borders.hairline,
    borderColor: palette.hairline,
  },
  cellToday: {
    borderWidth: borders.bold,
    borderColor: palette.strength.brandBright,
  },
});
