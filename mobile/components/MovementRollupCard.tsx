// MovementRollupCard — ONE card per movement type (the fix for "scrolling
// past 10 identical Padel cards"). Answers which activities + how often at a
// glance, leading with Whoop STRAIN when it varies, else gym beats, else avg
// duration. Tapping the whole card opens that type's dedicated screen ("click
// into Run, see my runs") — no inline expand.
//
//   [image]  PADEL            12.4      12× ›
//            last 2d ago      AVG STRAIN

import { View, Text, StyleSheet } from "react-native";
import { palette, radii, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card, Chip, StatNumber } from "@/components/ui";
import { MovementImage } from "@/components/MovementImage";
import { movementType, GYM_TYPE } from "@/lib/movementTypes";
import { fmtRecency, type MovementRollup } from "@/lib/movementRollup";

function identityFor(rollup: MovementRollup) {
  return rollup.kind === "gym" ? GYM_TYPE.identity : movementType(rollup.type).identity;
}
function nameFor(rollup: MovementRollup) {
  return rollup.kind === "gym" ? GYM_TYPE.name : movementType(rollup.type).name;
}

// The big headline numeral: strain leads when measured; gym shows its beats;
// otherwise the average duration (every item has one).
function headline(rollup: MovementRollup): { value: string; label: string } {
  if (rollup.avgStrain != null) return { value: String(rollup.avgStrain), label: "avg strain" };
  if (rollup.kind === "gym") {
    return { value: String(rollup.totalBeats ?? 0), label: rollup.totalBeats === 1 ? "beat" : "beats" };
  }
  return { value: String(rollup.avgDurationMin), label: "avg min" };
}

export function MovementRollupCard({
  rollup,
  now,
  onPress,
}: {
  rollup: MovementRollup;
  now: number;
  onPress: () => void;
}) {
  const id = identityFor(rollup);
  const name = nameFor(rollup);
  const h = headline(rollup);

  return (
    <Card
      identity={id.accent}
      depth="loud"
      tint={id.soft}
      style={styles.card}
      onPress={onPress}
      accessibilityLabel={`view ${name}`}
    >
      <MovementImage type={rollup.type} style={styles.image} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.typeName, { color: id.bright }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.countWrap}>
            <Chip
              label={`${rollup.count}×`}
              tone="accent"
              identity={id.bright}
              fill={id.soft}
              textColor={id.bright}
            />
            <Text style={[styles.chevron, { color: id.bright }]}>›</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.sub} numberOfLines={1}>
            last {fmtRecency(rollup.lastAt, now)}
          </Text>
          <StatNumber value={h.value} label={h.label} color={id.bright} align="left" />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    padding: spacing.sm,
    gap: spacing.md,
    alignItems: "center",
  },
  image: {
    width: 76,
    height: 76,
    borderRadius: radii.sm,
    backgroundColor: palette.surfaceMuted,
  },
  body: { flex: 1, gap: 4, paddingRight: spacing.xs },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeName: {
    fontFamily: condensedFamily,
    fontSize: fontSize.displayLg,
    fontWeight: "800",
    letterSpacing: condensedFamily ? 0.3 : -0.6,
    flexShrink: 1,
  },
  countWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  chevron: { fontSize: fontSize.lead, fontWeight: "800" },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sub: { flex: 1, fontSize: fontSize.caption, color: palette.textMuted, fontWeight: "600" },
});
