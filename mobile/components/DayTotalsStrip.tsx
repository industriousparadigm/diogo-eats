// Day totals strip shown at the top of the Today screen.
// Shows calories, protein, sat fat, soluble fiber, plant %.
// Numbers only — no red alerts, no grades. Reference numbers, not gates.
//
// Restyled onto the design system: a bordered + offset-shadow Card carrying
// big condensed display numerals (this strip is the day's headline numbers).
// Plant gets the food accent — it's the lead metric, the one to celebrate.

import { View, StyleSheet } from "react-native";
import { palette, spacing } from "@/lib/theme";
import { Card, StatNumber } from "@/components/ui";
import { fmtCal, fmt, fmtPlant } from "@/lib/format";
import type { DayTotals } from "@/lib/types";

type Props = {
  totals: DayTotals;
};

export function DayTotalsStrip({ totals }: Props) {
  return (
    <Card style={styles.card}>
      <View style={styles.strip}>
        <StatNumber value={fmtCal(totals.calories)} label="kcal" flex />
        <Divider />
        <StatNumber value={`${fmt(totals.protein_g)}g`} label="protein" flex />
        <Divider />
        <StatNumber value={`${fmt(totals.sat_fat_g)}g`} label="sat fat" flex />
        <Divider />
        <StatNumber value={`${fmt(totals.soluble_fiber_g)}g`} label="fiber" flex />
        <Divider />
        <StatNumber value={fmtPlant(totals.plant_pct)} label="plant" color={palette.food.accent} flex />
      </View>
    </Card>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: palette.hairline,
  },
});
