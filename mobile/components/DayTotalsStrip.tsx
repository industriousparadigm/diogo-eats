// Day totals strip shown at the top of the Today screen.
// Shows calories, protein, sat fat, soluble fiber, plant %.
// Day-level numbers render as INTEGERS — 36.3g protein is false
// precision at day scale (meal cards keep one decimal, where 0.4g
// fiber genuinely informs).
// Reference numbers, not gates — no grades, never red.
//
// DEPTH: the strip is CHROME, not a content card — it's the day's headline
// numbers, not a meal. So it goes FLAT (bordered, no offset block): the
// offset block is a top-level content-card privilege (meal/exercise cards,
// the headline, skeletons). See DESIGN.md "Depth rules".
//
// SEMANTIC COLOR (the food side's restrained palette, never a stoplight):
//   - plant  — always the food lime (the lead metric, the one to celebrate).
//   - fiber  — lime when AT/ABOVE target (the "keep up" lever, celebrated),
//              neutral otherwise.
//   - sat fat — amber ONLY when the day is OVER target (the "keep down"
//              lever). Amber is as loud as food gets — never red. Targets
//              come from the user's profile, never hardcoded.

import { View, StyleSheet } from "react-native";
import { palette, spacing } from "@/lib/theme";
import { Card, StatNumber } from "@/components/ui";
import { fmtCal, fmt, fmtPlant } from "@/lib/format";
import { DEFAULT_TARGETS, type DayTotals, type Targets } from "@/lib/types";

type Props = {
  totals: DayTotals;
  // The user's daily targets (from the profile). Drives fiber/sat-fat color.
  // Defaults keep the strip honest before the profile resolves.
  targets?: Targets;
};

export function DayTotalsStrip({ totals, targets = DEFAULT_TARGETS }: Props) {
  // Fiber: at/above target reads as the win -> lime. Below -> neutral.
  const fiberColor =
    totals.soluble_fiber_g >= targets.soluble_fiber_g ? palette.food.accent : undefined;
  // Sat fat: over target reads as watch-it -> amber. Otherwise neutral.
  const satFatColor =
    totals.sat_fat_g > targets.sat_fat_g ? palette.warn : undefined;

  return (
    <Card flat style={styles.card}>
      <View style={styles.strip}>
        <StatNumber value={fmtCal(totals.calories)} label="kcal" flex />
        <Divider />
        <StatNumber value={`${fmt(totals.protein_g, 0)}g`} label="protein" flex />
        <Divider />
        <StatNumber value={`${fmt(totals.sat_fat_g, 0)}g`} label="sat fat" color={satFatColor} flex />
        <Divider />
        <StatNumber value={`${fmt(totals.soluble_fiber_g, 0)}g`} label="fiber" color={fiberColor} flex />
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
