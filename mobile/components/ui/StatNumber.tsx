// StatNumber — a big condensed display numeral with a small uppercase label.
//
// This app is MADE of numbers (totals strips, LAST/BEST, kcal, weights). Any
// place where the NUMBER is the point uses this, so the condensed-numeral
// look is structural, not per-screen. Label sits below by default (totals
// strips) or is omitted for inline numerals.
//
//   <StatNumber value="2164" label="kcal" />
//   <StatNumber value="79%" label="plant" color={palette.food.accent} />
//   <StatNumber value="39" label="kg" size="lg" color={accent} />

import { View, Text, StyleSheet } from "react-native";
import { palette, typography } from "@/lib/theme";

type Props = {
  value: string;
  label?: string;
  // Numeral color — defaults to the app text. Pass a register accent to
  // make a number "the point" (plant %, a confirmed weight).
  color?: string;
  size?: "md" | "lg";
  // Left-align the pair (settings averages) vs center (totals strip).
  align?: "center" | "left";
  // Flex evenly inside a row (totals strips).
  flex?: boolean;
};

export function StatNumber({ value, label, color, size = "md", align = "center", flex = false }: Props) {
  return (
    <View style={[styles.wrap, align === "left" && styles.left, flex && styles.flex]}>
      <Text
        style={[
          size === "lg" ? typography.displayNumberLg : typography.displayNumber,
          { color: color ?? palette.text },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {label ? <Text style={[typography.statLabel, styles.label]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 2 },
  left: { alignItems: "flex-start" },
  flex: { flex: 1 },
  label: { marginTop: 1 },
});
