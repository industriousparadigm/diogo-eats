// Cold-start placeholder for an exercise detail. Loud register — hero +
// BEST + history cards wear the strength brand identity while metadata
// resolves (the overview snapshot usually warms it first).

import { View, StyleSheet } from "react-native";
import { palette, spacing, radii } from "@/lib/theme";
import { SectionHeader, SkeletonBlock, SkeletonCard } from "@/components/ui";

export function ExerciseDetailSkeleton() {
  return (
    <View accessibilityLabel="loading exercise">
      <SkeletonCard identity={palette.strength.brand} depth="loud" style={styles.hero}>
        <SkeletonBlock width={96} height={70} radius={radii.sm} tone="bright" />
        <View style={styles.heroText}>
          <SkeletonBlock width="90%" height={12} />
          <SkeletonBlock width="70%" height={12} />
        </View>
      </SkeletonCard>
      <View style={styles.spacer} />
      <SkeletonCard identity={palette.strength.brand} depth="loud" style={styles.bestCard}>
        <SkeletonBlock width={48} height={14} tone="bright" />
        <SkeletonBlock width={110} height={26} tone="bright" />
      </SkeletonCard>
      <View style={styles.spacer} />
      <SectionHeader style={styles.section}>EVERY SESSION</SectionHeader>
      <View style={styles.list}>
        {[0, 1].map((i) => (
          <SkeletonCard key={i} tone="recessed" style={styles.row}>
            <SkeletonBlock width={90} height={14} tone="bright" />
            <SkeletonBlock width={130} height={14} tone="bright" />
          </SkeletonCard>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  heroText: { flex: 1, gap: 8 },
  spacer: { height: spacing.md },
  bestCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  section: { marginBottom: spacing.md },
  list: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});
