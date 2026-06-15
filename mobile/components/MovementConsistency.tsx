// MovementConsistency — "how often am I moving, and how hard?" at a glance.
// Replaces the square grid (which had no start/end and no intensity). A bar
// per day (per week for long ranges), bar HEIGHT = intensity, a rest day = a
// faint baseline tick (so a gap reads as rest, not missing data), today on
// the right, axis labelled, one headline number. One flat loud Card (it's a
// supporting glance, so it goes flat — the offset block stays the rollup
// cards' signal, per DESIGN.md "Depth rules").

import { View, Text, StyleSheet } from "react-native";
import { palette, radii, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card } from "@/components/ui";
import type { Consistency } from "@/lib/movementConsistency";

const BAR_AREA_H = 56; // px, the plot height
const MIN_WORKED_FRAC = 0.18; // a worked day always shows at least this tall

export function MovementConsistency({
  consistency,
  periodDays,
}: {
  consistency: Consistency;
  periodDays: number;
}) {
  const { buckets, workoutDays } = consistency;

  return (
    <Card
      flat
      depth="loud"
      style={styles.card}
      accessibilityLabel={`worked out ${workoutDays} of the last ${periodDays} days`}
    >
      <View style={styles.header}>
        <Text style={styles.title}>WORKED OUT</Text>
        <Text style={styles.caption}>
          <Text style={styles.captionStrong}>{workoutDays}</Text> of last {periodDays} days
        </Text>
      </View>

      <View style={styles.plot}>
        {buckets.map((b, i) => {
          const isToday = i === buckets.length - 1;
          const frac = b.worked ? Math.max(b.intensity, MIN_WORKED_FRAC) : 0;
          return (
            <View key={i} style={styles.slot}>
              {b.worked ? (
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.round(frac * BAR_AREA_H),
                      backgroundColor: isToday ? palette.strength.brandBright : palette.strength.brand,
                    },
                  ]}
                />
              ) : (
                <View style={styles.restTick} />
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{periodDays}d ago</Text>
        <Text style={styles.axisLabel}>today</Text>
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
    fontSize: fontSize.bodyLg,
    color: palette.strength.brandBright,
    fontWeight: "800",
  },
  plot: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: BAR_AREA_H,
  },
  // Each day/week gets an equal slot; the bar sits ~60% wide inside it, which
  // gives the gaps for free and scales to any bucket count (15 days or 53 weeks).
  slot: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: BAR_AREA_H },
  bar: { width: "62%", borderRadius: radii.xs, minHeight: 3 },
  restTick: { width: "62%", height: 2, borderRadius: 1, backgroundColor: palette.inkSoft },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  axisLabel: {
    fontSize: fontSize.micro,
    fontWeight: "700",
    color: palette.textSubtle,
    letterSpacing: 0.4,
  },
});
