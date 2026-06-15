// MovementByActivity — the "how often, by activity" panel. This section is
// about COUNTING (which activities, how many times in the period), so it
// deliberately does NOT reuse the big photo-led look of the Recent cards.
// Instead, a compact frequency leaderboard: one row per type, sorted by count,
// with a horizontal bar (length = count relative to the most-done type) in the
// type's colour — the same colour language as the consistency chart's bars +
// legend. Tap a row → that type's screen.
//
// One flat loud Card panel (a supporting/overview surface, like the chart — the
// offset block stays the Recent cards' signal). Rows are hairline-separated
// interiors, never their own bordered cards (DESIGN.md depth rules).

import { View, Text, Pressable, StyleSheet } from "react-native";
import { palette, radii, borders, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card } from "@/components/ui";
import { movementType } from "@/lib/movementTypes";
import type { MovementRollup } from "@/lib/movementRollup";

// The secondary metric per row: strain when measured, gym beats, else avg
// duration. (Count is the hero; this is the "and how hard, typically".)
function metricText(r: MovementRollup): string {
  if (r.avgStrain != null) return `avg strain ${r.avgStrain}`;
  if (r.kind === "gym") return `${r.totalBeats ?? 0} beat${r.totalBeats === 1 ? "" : "s"}`;
  return `~${r.avgDurationMin} min`;
}

export function MovementByActivity({
  rollups,
  onPressType,
}: {
  rollups: MovementRollup[];
  onPressType: (type: string) => void;
}) {
  if (rollups.length === 0) return null;
  // buildRollups already sorts by count desc, so the first is the max.
  const max = Math.max(1, ...rollups.map((r) => r.count));

  return (
    <Card flat depth="loud" style={styles.panel}>
      {rollups.map((r, i) => {
        const id = movementType(r.type).identity; // movementType resolves "gym" too
        const name = movementType(r.type).name;
        const frac = r.count / max;
        return (
          <Pressable
            key={r.type}
            onPress={() => onPressType(r.type)}
            accessibilityLabel={`view ${name}`}
            style={[styles.row, i > 0 && styles.rowDivider]}
          >
            <View style={styles.top}>
              <View style={[styles.dot, { backgroundColor: id.accent }]} />
              <Text style={[styles.name, { color: id.bright }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.count, { color: id.bright }]}>{r.count}×</Text>
              <Text style={styles.chev}>›</Text>
            </View>
            <View style={styles.barRow}>
              <View style={styles.track}>
                <View
                  style={[styles.fill, { width: `${Math.round(frac * 100)}%`, backgroundColor: id.accent }]}
                />
              </View>
              <Text style={styles.metric} numberOfLines={1}>
                {metricText(r)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  row: { paddingVertical: spacing.sm, gap: 6 },
  rowDivider: { borderTopWidth: borders.hairline, borderTopColor: palette.hairline },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 3 },
  name: {
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  count: {
    fontFamily: condensedFamily,
    fontSize: fontSize.lead,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  chev: { fontSize: fontSize.lead, color: palette.textSubtle, fontWeight: "800" },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // The frequency bar: a faint full-width track with a coloured fill whose
  // length is the count relative to the most-done type.
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.surfaceMuted,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4, minWidth: 6 },
  metric: { fontSize: fontSize.micro, color: palette.textMuted, fontWeight: "700" },
});
