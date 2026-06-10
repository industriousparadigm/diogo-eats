// Cold-start placeholder for Looking back. Shaped like the real stack —
// headline card, calendar block, averages strip, two trend charts — so the
// satisfaction surface fills in without a jump, in the calm food register
// (neutral ink, soft shadow). Replaces the old generic gray box.

import { View, StyleSheet } from "react-native";
import { spacing, radii } from "@/lib/theme";
import { SectionHeader } from "@/components/ui";
import { SkeletonBlock, SkeletonCard } from "@/components/ui";

export function OverviewSkeleton() {
  return (
    <View accessibilityLabel="loading history" style={styles.wrap}>
      {/* Headline card */}
      <SkeletonCard style={styles.headline}>
        <SkeletonBlock width="90%" height={14} tone="bright" />
        <SkeletonBlock width="70%" height={14} tone="bright" style={styles.gap} />
      </SkeletonCard>

      {/* Calendar block */}
      <SkeletonCard style={styles.calendar}>
        <SkeletonBlock width="100%" height={120} tone="bright" />
      </SkeletonCard>

      {/* Averages strip */}
      <SkeletonCard tone="recessed" style={styles.avg}>
        <SectionHeader>AVERAGES</SectionHeader>
        <View style={styles.avgRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.avgStat}>
              <SkeletonBlock width={36} height={22} tone="bright" />
              <SkeletonBlock width={28} height={8} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      {/* Two trend charts */}
      {[0, 1].map((i) => (
        <SkeletonCard key={i} style={styles.trend}>
          <SkeletonBlock width="55%" height={11} />
          <SkeletonBlock width="100%" height={70} tone="bright" style={styles.gap} />
        </SkeletonCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  gap: {
    marginTop: spacing.sm,
  },
  headline: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  calendar: {
    padding: spacing.lg,
  },
  avg: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  avgRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  avgStat: {
    alignItems: "flex-start",
    gap: 6,
  },
  trend: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
  },
});
