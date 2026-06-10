// One item row inside the meal-edit screen: name + remove on top,
// grams + per-item nutrient summary below. Mirrors the web's ItemRow.
//
// Confidence dot on the left signals when Vision was guessing — a soft
// nudge to verify low/medium portions without alarming about them.

import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radii } from "@/lib/colors";
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
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    padding: 10,
    gap: 6,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  nameInput: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    minHeight: 36,
  },
  removeText: {
    color: colors.textSubtle,
    fontSize: 16,
    paddingHorizontal: 4,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gramsInput: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    width: 90,
  },
  gramsUnit: {
    fontSize: 12,
    color: colors.textSubtle,
  },
  perItem: {
    marginLeft: "auto",
    fontSize: 11,
    color: colors.textSubtle,
  },
});
