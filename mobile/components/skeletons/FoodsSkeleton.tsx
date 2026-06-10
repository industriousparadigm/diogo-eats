// Cold-start placeholder for the Foods library list. A few food-card
// shapes (name + provenance badge + stat row), so the first load fills in
// without the bare-spinner pop. Calm food register.

import { View, StyleSheet } from "react-native";
import { spacing, radii } from "@/lib/theme";
import { SkeletonBlock, SkeletonCard } from "@/components/ui";

export function FoodsSkeleton() {
  return (
    <View accessibilityLabel="loading foods" style={styles.wrap}>
      {[0, 1, 2, 3, 4].map((i) => (
        <SkeletonCard key={i} style={styles.card}>
          <View style={styles.top}>
            <SkeletonBlock width="55%" height={14} tone="bright" />
            <SkeletonBlock width={64} height={18} radius={radii.pill} />
          </View>
          <View style={styles.stats}>
            <SkeletonBlock width={48} height={10} />
            <SkeletonBlock width={44} height={10} />
            <SkeletonBlock width={44} height={10} />
            <SkeletonBlock width={40} height={10} />
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});
