// One item row inside the meal-edit screen: name + remove on top,
// grams + per-item nutrient summary below. Mirrors the web's ItemRow.
//
// Uncertainty is shown as a LABELED chip, never a bare colored dot
// (DESIGN.md "Uncertainty"): a low-confidence item — Vision was guessing —
// wears a small calm "guess" chip; medium/high wear nothing. The chip is
// the food register, so it stays calm: no orange ball, no alarm.

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { Chip, Input } from "@/components/ui";
import type { Item } from "@/lib/types";

type Props = {
  item: Item;
  onName: (v: string) => void;
  onGrams: (v: string) => void;
  onRemove: () => void;
  disabled: boolean;
};

export function EditItemRow({ item, onName, onGrams, onRemove, disabled }: Props) {
  const kcal = Math.round((item.grams * item.per_100g.calories) / 100);
  const sat = ((item.grams * item.per_100g.sat_fat_g) / 100).toFixed(1);
  const isGuess = item.confidence === "low";

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Input
          style={styles.nameInput}
          value={item.name}
          onChangeText={onName}
          editable={!disabled}
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
        <Input
          style={styles.gramsInput}
          value={String(item.grams)}
          onChangeText={onGrams}
          editable={!disabled}
          variant="numeric"
          suffix="g"
          accessibilityLabel={`${item.name} grams`}
        />
        {isGuess && <Chip label="guess" tone="neutral" accessibilityLabel="low-confidence guess" />}
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
    borderWidth: borders.chunky,
    borderColor: palette.ink,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  nameInput: {
    flex: 1,
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
    width: 110,
  },
  perItem: {
    marginLeft: "auto",
    fontSize: fontSize.label,
    color: palette.textSubtle,
  },
});
