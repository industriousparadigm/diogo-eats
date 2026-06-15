// MovementConsistency — "how often am I moving, and how hard?" at a glance.
// Replaces the square grid (which had no start/end and no intensity). A bar
// per day (per week for long ranges), bar HEIGHT = intensity, a rest day = a
// faint baseline tick (so a gap reads as rest, not missing data), today on
// the right, axis labelled, one headline number. One flat loud Card (it's a
// supporting glance, so it goes flat — the offset block stays the rollup
// cards' signal, per DESIGN.md "Depth rules").

import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { palette, radii, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card } from "@/components/ui";
import { movementType } from "@/lib/movementTypes";
import { fmtSessionDate } from "@/lib/strengthFormat";
import type { Consistency, ConsistencyBucket } from "@/lib/movementConsistency";

const BAR_AREA_H = 56; // px, the plot height
const MIN_WORKED_FRAC = 0.18; // a worked day always shows at least this tall

// A bar's identity: its type's colour when that type is one of the top few;
// otherwise the neutral "other" violet. Height comes from intensity, colour
// from this — the two read off the same dominant movement.
function barIdentity(type: string | null, topTypes: string[]) {
  if (type && topTypes.includes(type)) return movementType(type).identity;
  return palette.movement.other;
}

// The tooltip text for a tapped bar: "Mon 15 Jun · Run" (+ "+N more" when the
// day had several), or "rest day" for an empty bucket.
function bucketDetail(b: ConsistencyBucket): string {
  const when = fmtSessionDate(b.atMs);
  if (!b.worked) return `${when} · rest day`;
  const name = b.type ? movementType(b.type).name : "Workout";
  const extra = b.count > 1 ? ` +${b.count - 1} more` : "";
  return `${when} · ${name}${extra}`;
}

export function MovementConsistency({
  consistency,
  periodDays,
}: {
  consistency: Consistency;
  periodDays: number;
}) {
  const { buckets, workoutDays, topTypes = [] } = consistency;
  const [selected, setSelected] = useState<number | null>(null);

  // Legend: the top types (each its colour + name) + an "Other" swatch only
  // when some coloured bar actually fell outside the top set. Dedupe by name so
  // a literal "Other" type in the top set doesn't double up with the catch-all.
  const legend: { name: string; color: string }[] = [];
  for (const t of topTypes) {
    legend.push({ name: movementType(t).name, color: movementType(t).identity.accent });
  }
  if (buckets.some((b) => b.worked && b.type != null && !topTypes.includes(b.type))) {
    legend.push({ name: "Other", color: palette.movement.other.accent });
  }
  const seen = new Set<string>();
  const legendItems = legend.filter((e) => (seen.has(e.name) ? false : seen.add(e.name)));

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
          const id = barIdentity(b.type, topTypes);
          return (
            <Pressable
              key={i}
              style={styles.slot}
              onPress={() => setSelected(selected === i ? null : i)}
              accessibilityLabel={bucketDetail(b)}
            >
              {b.worked ? (
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.round(frac * BAR_AREA_H),
                      backgroundColor: isToday ? id.bright : id.accent,
                    },
                    selected === i && styles.barSelected,
                  ]}
                />
              ) : (
                <View style={[styles.restTick, selected === i && styles.restTickSelected]} />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{periodDays}d ago</Text>
        <Text style={styles.axisLabel}>today</Text>
      </View>

      {/* Tap a bar → what that bucket was (date + activity), or "rest day". */}
      {selected != null ? (
        <View style={styles.detail}>
          <View
            style={[
              styles.detailSwatch,
              {
                backgroundColor: buckets[selected].worked
                  ? barIdentity(buckets[selected].type, topTypes).accent
                  : palette.inkSoft,
              },
            ]}
          />
          <Text style={styles.detailText}>{bucketDetail(buckets[selected])}</Text>
        </View>
      ) : null}

      {/* Legend — which colour is which activity (top few + Other). */}
      {legendItems.length > 0 ? (
        <View style={styles.legend}>
          {legendItems.map((e) => (
            <View key={e.name} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: e.color }]} />
              <Text style={styles.legendLabel}>{e.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
  // The tapped bar gets a hairline cream ring so it reads as "this one".
  barSelected: {
    borderWidth: 1.5,
    borderColor: palette.text,
  },
  restTick: { width: "62%", height: 2, borderRadius: 1, backgroundColor: palette.inkSoft },
  restTickSelected: { height: 4, backgroundColor: palette.textSubtle },
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
  // The tap-a-bar detail line: a colour dot in the bar's identity + the date
  // and what it was.
  detail: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  detailSwatch: { width: 9, height: 9, borderRadius: 2 },
  detailText: { fontSize: fontSize.caption, color: palette.text, fontWeight: "600" },
  // Legend: small colour swatches + type names, wrapping.
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 9, height: 9, borderRadius: 2 },
  legendLabel: {
    fontSize: fontSize.micro,
    fontWeight: "700",
    color: palette.textMuted,
    letterSpacing: 0.3,
  },
});
