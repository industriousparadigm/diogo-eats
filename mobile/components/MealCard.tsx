// Meal card — shown in the Today list.
// Shows: photo thumbnail (if any), meal_vibe, items summary, cal/plant badge.
// Swipe left or long-press to reveal delete affordance.
// No grades, no streaks — identity language only.
//
// Restyled onto the design system: a chunky-ink-bordered Card with a hard
// offset shadow (the calm food register — neutral ink, not a color identity).
// The photo sits hard against the inked left edge (the card's photo-led DNA);
// kcal is a condensed display numeral; plant % keeps its single-hue scale.

import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Image } from "expo-image";
import { palette, radii, borders, fontSize, spacing, plantColor, condensedFamily } from "@/lib/theme";
import { Card, Chip } from "@/components/ui";
import { fmtCal, fmtPlant, itemsSummary, fmtTime } from "@/lib/format";
import { resolvePhotoUrl } from "@/lib/api";
import type { Meal } from "@/lib/types";
import { RepeatButton } from "./RepeatButton";
import { PhotoLightbox } from "./PhotoLightbox";

type Props = {
  meal: Meal;
  onDelete: (id: string) => void;
  // Tap → meal detail/edit screen. Long-press keeps the quick-delete.
  onOpen?: () => void;
  // Deterministic re-log at a scale. When provided, the ↻ chip shows.
  onRepeat?: (scale: number) => Promise<void>;
};

export function MealCard({ meal, onDelete, onOpen, onRepeat }: Props) {
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
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderText}>...</Text>
          </View>
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
          <View style={styles.badges}>
            <View style={styles.kcalWrap}>
              <Text style={styles.kcalNum}>{fmtCal(meal.calories)}</Text>
              <Text style={styles.kcalUnit}>kcal</Text>
            </View>
            <Chip
              label={`${fmtPlant(meal.plant_pct)} plant`}
              fill={pc}
              textColor={palette.text}
            />
            {onRepeat && (
              <View style={styles.repeatWrap}>
                <RepeatButton onRepeat={onRepeat} variant="card" />
              </View>
            )}
          </View>
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

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    padding: spacing.md,
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
  thumbPlaceholder: {
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: {
    color: palette.textFaint,
    fontSize: fontSize.body,
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
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  kcalWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  kcalNum: {
    fontFamily: condensedFamily,
    fontSize: fontSize.lead,
    fontWeight: "800",
    color: palette.food.cream,
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : -0.3,
  },
  kcalUnit: {
    fontSize: fontSize.tiny,
    fontWeight: "700",
    color: palette.textSubtle,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  repeatWrap: {
    marginLeft: "auto",
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
