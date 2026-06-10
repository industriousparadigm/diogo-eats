// Cold-start placeholder for a strength session detail. Loud register:
// the per-exercise cards wear color identities + loud shadow blocks, the
// exact cards they precede, just unfilled. Shown only on a cold open
// (the overview snapshot usually warms the metadata first).

import { View, StyleSheet } from "react-native";
import { palette, spacing, radii, exerciseIdentity } from "@/lib/theme";
import { SectionHeader, SkeletonBlock, SkeletonCard } from "@/components/ui";

const SEEDED = ["leg-press", "back-extension", "chest-press"];

export function SessionDetailSkeleton() {
  return (
    <View accessibilityLabel="loading session">
      <SkeletonBlock width="55%" height={18} tone="bright" />
      <View style={styles.spacer} />
      <SectionHeader style={styles.section}>WHAT YOU LOGGED</SectionHeader>
      <View style={styles.cardList}>
        {SEEDED.map((id) => {
          const accent = exerciseIdentity(id).accent;
          return (
            <SkeletonCard key={id} identity={accent} depth="loud" style={styles.exCard}>
              <View style={styles.exHeader}>
                <SkeletonBlock width={56} height={42} radius={radii.sm} tone="bright" />
                <SkeletonBlock width="45%" height={16} tone="bright" />
              </View>
              <SkeletonBlock width="60%" height={13} />
              <SkeletonBlock width="60%" height={13} />
            </SkeletonCard>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spacer: { height: spacing.sm },
  section: { marginBottom: spacing.md },
  cardList: { gap: spacing.md },
  exCard: { padding: spacing.md, gap: spacing.sm },
  exHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
