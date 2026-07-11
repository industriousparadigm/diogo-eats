// Movement timeline cards — the IMAGE-LED cards that make the Movement tab
// pop. Both kinds share the day-1-card DNA (photo hard against an inked
// edge, chunky color border + loud offset block, big condensed numeral,
// loud register) but carry different content:
//
//   SessionCard  — a gym session. Amber identity, the gym photo, exercise
//     NAMES, and the beats badge the strength landing already used (amber
//     when ≥1, neutral at 0). Tap → session detail.
//   ActivityCard — a general activity. Its type's color identity + photo,
//     the type name + label sub-line ("padel · class"), the DURATION as the
//     big StatNumber (90 MIN), a felt-effort chip, and distance when present.
//     Tap → the edit sheet.
//
// One chunky border + offset block per card (DESIGN.md "Depth rules"); the
// tint wash rides through the Card `tint` prop on the opaque base, never a
// translucent backgroundColor.

import { View, Text, StyleSheet } from "react-native";
import { palette, radii, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card, Chip, StatNumber } from "@/components/ui";
import { MovementImage } from "@/components/MovementImage";
import { movementType, GYM_TYPE } from "@/lib/movementTypes";
import { fmtSessionDate } from "@/lib/strengthFormat";
import { fmtEffort, fmtDistance, fmtActivitySubtitle } from "@/lib/movementLog";
import type { Activity } from "@/lib/activityTypes";
import type { SessionSummary } from "@/lib/strengthTypes";

// ---- a gym session in the timeline ---------------------------------------

export function SessionCard({
  session,
  exerciseNames,
  onPress,
}: {
  session: SessionSummary;
  // Resolved exercise display names, in logged order (caller maps ids).
  exerciseNames: string[];
  onPress: () => void;
}) {
  const id = GYM_TYPE.identity;
  const beats = session.beats_count;
  const names = exerciseNames.join(" · ");
  return (
    <Card
      identity={id.accent}
      depth="loud"
      tint={id.soft}
      style={styles.card}
      onPress={onPress}
      accessibilityLabel={`gym session ${fmtSessionDate(session.completed_at)}`}
    >
      <MovementImage type="gym" style={styles.image} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.typeName, { color: id.bright }]}>Gym</Text>
          <Chip
            label={`${beats} beat${beats === 1 ? "" : "s"}`}
            tone={beats === 0 ? "neutral" : "accent"}
            identity={id.bright}
            fill={beats === 0 ? palette.surfaceMuted : id.soft}
            textColor={beats === 0 ? palette.textMuted : id.bright}
          />
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {names || `${session.exercise_ids.length} exercises`}
        </Text>
        <Text style={styles.date}>{fmtSessionDate(session.completed_at)}</Text>
      </View>
    </Card>
  );
}

// ---- a general activity in the timeline -----------------------------------

export function ActivityCard({
  activity,
  onPress,
}: {
  activity: Activity;
  onPress: () => void;
}) {
  const def = movementType(activity.type);
  const id = def.identity;
  const effort = fmtEffort(activity.effort);
  const distance = def.distance ? fmtDistance(activity.distance_km) : null;
  return (
    <Card
      identity={id.accent}
      depth="loud"
      tint={id.soft}
      style={styles.card}
      onPress={onPress}
      accessibilityLabel={`${def.name} ${fmtSessionDate(activity.started_at)}`}
    >
      <MovementImage type={activity.type} style={styles.image} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.typeName, { color: id.bright }]}>{def.name}</Text>
          <StatNumber
            value={String(activity.duration_min)}
            label="min"
            color={id.bright}
            align="left"
          />
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {fmtActivitySubtitle(def.name, activity.label)}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.date}>{fmtSessionDate(activity.started_at)}</Text>
          {distance ? (
            <Chip
              label={distance}
              tone="accent"
              identity={id.bright}
              fill={id.soft}
              textColor={id.bright}
            />
          ) : null}
          {effort ? (
            <Chip label={effort} tone="outline" identity={id.bright} />
          ) : null}
          {activity.strain != null ? (
            <Chip label={`strain ${activity.strain.toFixed(1)}`} tone="outline" identity={id.bright} />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // Photo-led row card: image hard against the inked left edge, body to its
  // right. One chunky border + loud block per card.
  card: {
    flexDirection: "row",
    padding: spacing.sm,
    gap: spacing.md,
    alignItems: "center",
  },
  image: {
    width: 84,
    height: 84,
    borderRadius: radii.sm,
    backgroundColor: palette.surfaceMuted,
  },
  body: {
    flex: 1,
    gap: 3,
    paddingRight: spacing.xs,
  },
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
  },
  subtitle: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginTop: 2,
  },
  date: {
    fontSize: fontSize.label,
    color: palette.textSubtle,
    fontWeight: "700",
  },
});
