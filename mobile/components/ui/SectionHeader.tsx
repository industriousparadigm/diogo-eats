// SectionHeader — the letterspaced uppercase label that opens a section
// ("THE NUMBERS TO BEAT", "AVERAGES · LAST 14 LOGGED DAYS", "YOUR FOODS").
//
// Optional accent color so a strength section can wear its register's amber
// and a food section stays subtle. Optional trailing slot for a count / toggle.

import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { typography } from "@/lib/theme";

type Props = {
  children: string;
  color?: string;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ children, color, trailing, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <Text style={[typography.sectionHeader, color ? { color } : null]}>{children}</Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
