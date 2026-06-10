// One item row inside the meal-edit screen: name + remove on top,
// grams + per-item nutrient summary below. Mirrors the web's ItemRow.
//
// Confidence dot on the left signals when Vision was guessing — a soft
// nudge to verify low/medium portions without alarming about them.

import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import type { Item } from "@/lib/types";

type Props = {
  item: Item;
  onName: (v: string) => void;
  onGrams: (v: string) => void;
  onRemove: () => void;
  disabled: boolean;
};

export function EditItemRow({ item, onName, onGrams, onRemove, disabled }: Props) {
  const dot =
    item.confidence === "low"
      ? "#f97316" // low confidence — Vision was guessing
      : item.confidence === "medium"
        ? "#eab308" // medium confidence — reasonable estimate
        : null;

  const kcal = Math.round((item.grams * item.per_100g.calories) / 100);
  const sat = ((item.grams * item.per_100g.sat_fat_g) / 100).toFixed(1);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
        <TextInput
          style={styles.nameInput}
          value={item.name}
          onChangeText={onName}
          editable={!disabled}
          multiline
          accessibilityLabel="item name"
        />
        <TouchableOpacity
          onPress={onRemove}
          disabled={disabled}
          accessibilityLabel={`remove ${item.name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.removeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.bottomRow}>
        <TextInput
          style={styles.gramsInput}
          value={String(item.grams)}
          onChangeText={onGrams}
          editable={!disabled}
          keyboardType="numeric"
          accessibilityLabel={`${item.name} grams`}
        />
        <Text style={styles.gramsUnit}>g</Text>
        <Text style={styles.perItem}>
          {kcal} kcal · {sat}g sat
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  nameInput: {
    flex: 1,
    backgroundColor: palette.surfaceMuted,
    color: palette.text,
    borderWidth: borders.hairline,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    minHeight: 36,
  },
  removeText: {
    color: palette.textSubtle,
    fontSize: fontSize.title,
    paddingHorizontal: spacing.xs,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  gramsInput: {
    backgroundColor: palette.surfaceMuted,
    color: palette.text,
    borderWidth: borders.hairline,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    width: 90,
  },
  gramsUnit: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
  },
  perItem: {
    marginLeft: "auto",
    fontSize: fontSize.label,
    color: palette.textSubtle,
  },
});
