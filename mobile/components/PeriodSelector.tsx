// PeriodSelector — the app's one time-range control: 7d / 15d / 1mo / 3mo /
// 1y. Lives on Looking Back and Movement so the two read as the same app (the
// bespoke "4 wk / 90 d" Movement toggle is gone). The active pill wears the
// surface's register accent — food lime by default, strength amber on
// Movement (pass `activeBg` / `activeText`).

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";

export const PERIODS = [
  { days: 7, label: "7d" },
  { days: 15, label: "15d" },
  { days: 30, label: "1mo" },
  { days: 90, label: "3mo" },
  { days: 365, label: "1y" },
] as const;

export const DEFAULT_PERIOD_DAYS = 15;

export function PeriodSelector({
  value,
  onChange,
  activeBg = palette.food.accentSoft,
  activeText = palette.food.accentBright,
}: {
  value: number;
  onChange: (days: number) => void;
  activeBg?: string;
  activeText?: string;
}) {
  return (
    <View style={styles.row}>
      {PERIODS.map((p) => {
        const active = p.days === value;
        return (
          <TouchableOpacity
            key={p.days}
            onPress={() => onChange(p.days)}
            style={[styles.btn, active && { backgroundColor: activeBg }]}
            accessibilityLabel={`show ${p.label}`}
          >
            <Text style={[styles.text, active && { color: activeText }]}>{p.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: palette.surfaceAlt,
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.sm,
    padding: 3,
    gap: 2,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderRadius: radii.xs,
  },
  text: {
    fontSize: fontSize.caption,
    fontWeight: "700",
    color: palette.textSubtle,
    letterSpacing: 0.3,
  },
});
