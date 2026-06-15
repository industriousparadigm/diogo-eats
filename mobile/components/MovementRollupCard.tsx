// MovementRollupCard — ONE card per movement type, the fix for "scrolling
// past 10 identical Padel · 112m cards". It answers which activities and how
// often at a glance, and leads with Whoop STRAIN (the metric that actually
// varies) instead of the samey duration.
//
//   [image]  PADEL            12.4        12×
//            last 2d ago · ~108 min      AVG STRAIN
//
// Tap → expands inline to a hairline-separated list of that type's sessions
// (date · detail · strain/beats), each tappable to its detail/edit surface.
// One chunky border + offset block for the whole card; the expanded rows are
// interior hairline rows (DESIGN.md "Depth rules": no nested chunky border).

import { View, Text, Pressable, StyleSheet } from "react-native";
import { palette, radii, borders, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card, Chip, StatNumber } from "@/components/ui";
import { MovementImage } from "@/components/MovementImage";
import { movementType, GYM_TYPE } from "@/lib/movementTypes";
import { fmtSessionDate } from "@/lib/strengthFormat";
import { fmtDistance, fmtPace } from "@/lib/movementLog";
import { fmtRecency, type MovementRollup } from "@/lib/movementRollup";
import type { TimelineItem } from "@/lib/movementTimeline";

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
  expanded,
  now,
  onToggle,
  onPressItem,
  exerciseNamesFor,
}: {
  rollup: MovementRollup;
  expanded: boolean;
  now: number;
  onToggle: () => void;
  onPressItem: (item: TimelineItem) => void;
  // Resolve a gym session's exercise ids to display names (caller has the map).
  exerciseNamesFor: (ids: string[]) => string[];
}) {
  const id = identityFor(rollup);
  const name = nameFor(rollup);
  const h = headline(rollup);
  const sub =
    rollup.kind === "gym"
      ? `last ${fmtRecency(rollup.lastAt, now)} · ${rollup.count} session${rollup.count === 1 ? "" : "s"}`
      : `last ${fmtRecency(rollup.lastAt, now)} · ~${rollup.avgDurationMin} min`;

  return (
    <Card identity={id.accent} depth="loud" tint={id.soft} style={styles.card}>
      <Pressable
        onPress={onToggle}
        style={styles.head}
        accessibilityLabel={`${name}, ${rollup.count} in window, ${expanded ? "collapse" : "expand"}`}
      >
        <MovementImage type={rollup.type} style={styles.image} />
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={[styles.typeName, { color: id.bright }]} numberOfLines={1}>
              {name}
            </Text>
            <Chip
              label={`${rollup.count}×`}
              tone="accent"
              identity={id.bright}
              fill={id.soft}
              textColor={id.bright}
            />
          </View>
          <View style={styles.metaRow}>
            <View style={styles.sub}>
              <Text style={styles.subText} numberOfLines={1}>
                {sub}
              </Text>
              <Text style={[styles.chevron, expanded && styles.chevronOpen]}>
                {expanded ? "Hide" : "Show all"}
              </Text>
            </View>
            <StatNumber value={h.value} label={h.label} color={id.bright} align="left" />
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.list}>
          {rollup.items.map((item) => (
            <CompactRow
              key={item.kind === "session" ? `s-${item.session.id}` : `a-${item.activity.id}`}
              item={item}
              identity={id}
              exerciseNamesFor={exerciseNamesFor}
              onPress={() => onPressItem(item)}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

// A single in-window session/activity, lean: dot · date · detail · metric.
// Interior row (hairline-separated), never its own card — keeps one block
// per visual unit.
function CompactRow({
  item,
  identity,
  exerciseNamesFor,
  onPress,
}: {
  item: TimelineItem;
  identity: { accent: string; bright: string; soft: string };
  exerciseNamesFor: (ids: string[]) => string[];
  onPress: () => void;
}) {
  let detail: string;
  let metric: string;
  if (item.kind === "session") {
    const names = exerciseNamesFor(item.session.exercise_ids);
    detail = names.join(" · ") || `${item.session.exercise_ids.length} exercises`;
    metric = `${item.session.beats_count} beat${item.session.beats_count === 1 ? "" : "s"}`;
  } else {
    const a = item.activity;
    // For distance activities, show distance + derived pace; else the label.
    const bits = [a.label, fmtDistance(a.distance_km), fmtPace(a.distance_km, a.duration_min)].filter(
      Boolean
    );
    detail = bits.length ? bits.join(" · ") : "—";
    metric = a.strain != null ? `${a.strain} strain` : `${a.duration_min} min`;
  }
  return (
    <Pressable onPress={onPress} style={styles.compact} accessibilityLabel={`open ${fmtSessionDate(item.at)}`}>
      <View style={[styles.dot, { backgroundColor: identity.accent }]} />
      <Text style={styles.compactDate}>{fmtSessionDate(item.at)}</Text>
      <Text style={styles.compactDetail} numberOfLines={1}>
        {detail}
      </Text>
      <Text style={[styles.compactMetric, { color: identity.bright }]}>{metric}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: "visible" },
  head: {
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
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sub: { flex: 1, gap: 2 },
  subText: { fontSize: fontSize.caption, color: palette.textMuted, fontWeight: "600" },
  chevron: {
    fontSize: fontSize.label,
    color: palette.textSubtle,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  chevronOpen: { color: palette.textMuted },

  // Expanded interior list — hairline-separated rows, not nested cards.
  // No border on the container; each row's own top hairline does the
  // separating (the first row's top line splits the list from the head).
  list: {},
  compact: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: palette.hairline,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  compactDate: {
    fontSize: fontSize.label,
    color: palette.textSubtle,
    fontWeight: "700",
    width: 58,
  },
  compactDetail: { flex: 1, fontSize: fontSize.caption, color: palette.textMuted },
  compactMetric: {
    fontFamily: condensedFamily,
    fontSize: fontSize.body,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});
