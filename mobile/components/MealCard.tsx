// Meal card — shown in the Today list.
// Shows: photo thumbnail (if any), meal_vibe, items summary, cal/plant badge.
// Swipe left or long-press to reveal delete affordance.
// No grades, no streaks — identity language only.

import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { colors, radii, plantColor } from "@/lib/colors";
import { fmtCal, fmtPlant, itemsSummary, fmtTime } from "@/lib/format";
import { resolvePhotoUrl } from "@/lib/api";
import type { Meal } from "@/lib/types";

type Props = {
  meal: Meal;
  onDelete: (id: string) => void;
};

export function MealCard({ meal, onDelete }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

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

  const hasMeals = true; // the card only renders when there are meals
  const pc = plantColor(meal.plant_pct, hasMeals);

  return (
    <Pressable
      onLongPress={() => setShowDelete(true)}
      onPress={() => showDelete && setShowDelete(false)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.inner}>
        {/* Photo thumbnail */}
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.thumb}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
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
            <View style={[styles.badge, styles.calBadge]}>
              <Text style={styles.badgeText}>{fmtCal(meal.calories)} kcal</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: pc }]}>
              <Text style={[styles.badgeText, styles.plantBadgeText]}>
                {fmtPlant(meal.plant_pct)} plant
              </Text>
            </View>
          </View>
        </View>
      </View>

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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginHorizontal: 16,
    marginBottom: 8,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.85,
  },
  inner: {
    flexDirection: "row",
    padding: 12,
    gap: 12,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: {
    color: colors.textFaint,
    fontSize: 14,
  },
  thumbText: {
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbTextIcon: {
    color: colors.textSubtle,
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  vibe: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  time: {
    fontSize: 12,
    color: colors.textSubtle,
    flexShrink: 0,
  },
  items: {
    fontSize: 12,
    color: colors.textMuted,
  },
  badges: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 100,
  },
  calBadge: {
    backgroundColor: colors.surfaceMuted,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  plantBadgeText: {
    color: colors.text,
  },
  deleteRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.badStrong,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
