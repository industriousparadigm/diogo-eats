// Meal card — shown in the Today list.
//
// This is NOT a calorie counter. The card leads with the metrics that move
// Diogo's LDL and protects the nudge (root README "Lead with what's working"):
//   - the Vision one-liner (meal.notes) in the app's own italic voice, when
//     present ("Good soluble-fiber start to the day") — truncated to ~2 lines.
//   - FIBER and SAT FAT as the visible numbers (the keep-up + keep-down
//     levers). Sat fat goes amber ONLY when this one meal alone is a large
//     share of the daily target (mealSatFatIsHigh) — never red, see the
//     helper for the threshold rationale.
//   - plant share COMPACT — a small single-hue swatch + "%", not a big pill.
//   - kcal DEMOTED — small, and last.
//
// No ↻ on the card (repeat lives in the capture-sheet recents + meal detail),
// no grades, no streaks — identity language only.
//
// A chunky-ink-bordered Card with the hard offset block (a top-level content
// card — it keeps the block). The photo sits hard against the inked left edge
// (the card's photo-led DNA).

import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Image } from "expo-image";
import { palette, radii, borders, fontSize, spacing, plantColor, condensedFamily } from "@/lib/theme";
import { Card, SkeletonBlock } from "@/components/ui";
import { fmt, fmtCal, fmtPlant, itemsSummary, fmtTime, mealSatFatIsHigh } from "@/lib/format";
import { resolvePhotoUrl } from "@/lib/api";
import { DEFAULT_TARGETS, type Meal, type Targets } from "@/lib/types";
import { PhotoLightbox } from "./PhotoLightbox";

type Props = {
  meal: Meal;
  onDelete: (id: string) => void;
  // Tap → meal detail/edit screen. Long-press keeps the quick-delete.
  onOpen?: () => void;
  // The user's daily targets — drives the per-meal sat-fat amber threshold.
  // Reference numbers, not gates; never hardcoded. Defaults stand in until
  // the profile resolves.
  targets?: Targets;
};

export function MealCard({ meal, onDelete, onOpen, targets = DEFAULT_TARGETS }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!meal.photo_filename) return;
    let cancelled = false;
    resolvePhotoUrl(meal.photo_filename)
      .then((url) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch(() => {
        // Photo unavailable — card still renders without thumbnail.
      });
    return () => {
      cancelled = true;
    };
  }, [meal.photo_filename]);

  function confirmDelete() {
    Alert.alert(
      "Delete meal?",
      meal.meal_vibe ? `"${meal.meal_vibe}"` : "This can't be undone.",
      [
        { text: "Cancel", style: "cancel", onPress: () => setShowDelete(false) },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(meal.id),
        },
      ]
    );
  }

  const pc = plantColor(meal.plant_pct, true);
  const satFatHigh = mealSatFatIsHigh(meal.sat_fat_g, targets.sat_fat_g);

  return (
    <Card
      style={styles.card}
      onLongPress={() => setShowDelete(true)}
      onPress={() => {
        if (showDelete) setShowDelete(false);
        else onOpen?.();
      }}
      accessibilityLabel={`open meal ${meal.meal_vibe ?? meal.caption ?? ""}`.trim()}
    >
      <View style={styles.inner}>
        {/* Photo thumbnail — hard against the inked left edge. */}
        {photoUrl ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              setLightbox(true);
            }}
            accessibilityLabel="open photo"
            style={styles.thumb}
            activeOpacity={0.85}
          >
            <Image
              source={{ uri: photoUrl }}
              style={styles.thumbImg}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          </TouchableOpacity>
        ) : meal.photo_filename ? (
          // Signed URL still resolving — a skeleton block, not a "..." gap.
          <SkeletonBlock width={72} height={72} radius={radii.sm} tone="bright" style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbText]}>
            <Text style={styles.thumbTextIcon}>T</Text>
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.vibe} numberOfLines={1}>
              {meal.meal_vibe ?? meal.caption ?? "meal"}
            </Text>
            <Text style={styles.time}>{fmtTime(meal.created_at)}</Text>
          </View>
          <Text style={styles.items} numberOfLines={1}>
            {itemsSummary(meal.items_json)}
          </Text>

          {/* The app's voice — Vision's one-liner, when there is one. */}
          {meal.notes ? (
            <Text style={styles.notes} numberOfLines={2}>
              {meal.notes}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Metric hierarchy: plant compact, then the two levers (fiber +
          sat fat), kcal small + last. NOT a calorie counter. A full-width
          footer row — it spans the card, not the text column, so tall
          cards don't strand dead space under the photo. */}
      <View style={styles.metrics}>
        <View style={styles.plantWrap} accessibilityLabel={`${fmtPlant(meal.plant_pct)} plant`}>
          <View style={[styles.plantSwatch, { backgroundColor: pc }]} />
          <Text style={styles.plantPct}>{fmtPlant(meal.plant_pct)}</Text>
        </View>
        <Metric
          label="fiber"
          value={`${fmt(meal.soluble_fiber_g)}g`}
        />
        <Metric
          label="sat fat"
          value={`${fmt(meal.sat_fat_g)}g`}
          color={satFatHigh ? palette.warn : undefined}
        />
        <View style={styles.kcalWrap}>
          <Text style={styles.kcalNum}>{fmtCal(meal.calories)}</Text>
          <Text style={styles.kcalUnit}>kcal</Text>
        </View>
      </View>

      <PhotoLightbox uri={photoUrl} visible={lightbox} onClose={() => setLightbox(false)} />

      {/* Delete affordance — shown on long-press */}
      {showDelete && (
        <View style={styles.deleteRow}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={confirmDelete}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowDelete(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

// A small metric pair on the card: a condensed value over a tiny label.
// The value wears `color` only when it's the point (sat fat over the
// single-meal threshold) — otherwise the calm cream numeral.
function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radii.sm,
    flexShrink: 0,
    borderWidth: borders.bold,
    borderColor: palette.ink,
    overflow: "hidden",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  thumbText: {
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbTextIcon: {
    color: palette.textSubtle,
    fontSize: fontSize.lead,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  vibe: {
    fontSize: fontSize.bodyLg,
    fontWeight: "700",
    color: palette.text,
    flex: 1,
  },
  time: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    flexShrink: 0,
  },
  items: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
  },
  // Vision's one-liner — the app's voice. Italic, calm, ~2 lines.
  notes: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    fontStyle: "italic",
    lineHeight: 17,
    marginTop: 1,
  },
  // Full-width footer row spanning the card (not the text column).
  metrics: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  // Plant share — compact: a small single-hue swatch + the %, not a big pill.
  plantWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  plantSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: borders.hairline,
    borderColor: palette.inkSoft,
  },
  plantPct: {
    fontFamily: condensedFamily,
    fontSize: fontSize.title,
    fontWeight: "800",
    color: palette.food.accentBright,
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : -0.3,
  },
  // The two levers — the visible numbers on the card.
  metric: {
    alignItems: "flex-start",
  },
  metricValue: {
    fontFamily: condensedFamily,
    fontSize: fontSize.title,
    fontWeight: "800",
    color: palette.food.cream,
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : -0.3,
  },
  metricLabel: {
    fontSize: fontSize.micro,
    fontWeight: "700",
    color: palette.textSubtle,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 1,
  },
  // kcal — demoted: small, and last in the row.
  kcalWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginLeft: "auto",
  },
  kcalNum: {
    fontFamily: condensedFamily,
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.textMuted,
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : -0.3,
  },
  kcalUnit: {
    fontSize: fontSize.micro,
    fontWeight: "700",
    color: palette.textSubtle,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  deleteRow: {
    flexDirection: "row",
    borderTopWidth: borders.bold,
    borderTopColor: palette.ink,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: palette.dangerStrong,
  },
  deleteText: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.white,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  cancelText: {
    fontSize: fontSize.body,
    color: palette.textMuted,
  },
});
