// Cold-start placeholder for the Today screen: a skeleton totals strip +
// a few skeleton meal cards, shaped exactly like DayTotalsStrip + MealCard
// so the real content slots in without a layout jump. Shown ONLY when there
// is no cached snapshot for the viewed day; a cache hit renders real data.

import { View, StyleSheet } from "react-native";
import { spacing } from "@/lib/theme";
import { SkeletonBlock, SkeletonCard } from "@/components/ui";

export function DayScreenSkeleton() {
  return (
    <View accessibilityLabel="loading meals">
      {/* Totals strip placeholder — five stat slots */}
      <SkeletonCard style={styles.totals}>
        <View style={styles.totalsRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.stat}>
              <SkeletonBlock width={34} height={22} tone="bright" />
              <SkeletonBlock width={26} height={8} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      {/* Meal card placeholders */}
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} style={styles.meal}>
          <View style={styles.mealInner}>
            <SkeletonBlock width={72} height={72} tone="bright" />
            <View style={styles.mealBody}>
              <SkeletonBlock width="60%" height={15} tone="bright" />
              <SkeletonBlock width="85%" height={11} />
              <View style={styles.mealBadges}>
                <SkeletonBlock width={48} height={18} tone="bright" />
                <SkeletonBlock width={64} height={18} />
              </View>
            </View>
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  totals: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  stat: {
    alignItems: "center",
    gap: 6,
  },
  meal: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  mealInner: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.md,
  },
  mealBody: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
  },
  mealBadges: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 2,
  },
});
