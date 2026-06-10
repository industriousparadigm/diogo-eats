// Day totals strip shown at the top of the Today screen.
// Shows calories, protein, sat fat, soluble fiber, plant %.
// Numbers only — no red alerts, no grades. Reference numbers, not gates.

import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/lib/colors";
import { fmtCal, fmt, fmtPlant } from "@/lib/format";
import type { DayTotals } from "@/lib/types";

type Props = {
  totals: DayTotals;
};

export function DayTotalsStrip({ totals }: Props) {
  return (
    <View style={styles.strip}>
      <TotalsItem label="kcal" value={fmtCal(totals.calories)} />
      <Divider />
      <TotalsItem label="protein" value={`${fmt(totals.protein_g)}g`} />
      <Divider />
      <TotalsItem label="sat fat" value={`${fmt(totals.sat_fat_g)}g`} />
      <Divider />
      <TotalsItem label="fiber" value={`${fmt(totals.soluble_fiber_g)}g`} />
      <Divider />
      <TotalsItem label="plant" value={fmtPlant(totals.plant_pct)} accent />
    </View>
  );
}

function TotalsItem({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.item}>
      <Text style={[styles.value, accent && styles.accentValue]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  value: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  accentValue: {
    color: colors.brand,
  },
  label: {
    fontSize: 10,
    color: colors.textSubtle,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
});
