// Cold-start placeholder for the Strength overview. The scoreboard is the
// LOUD register, so its skeletons wear color identities + loud shadow
// blocks — the exact exercise cards they precede, just unfilled. History
// rows are quieter recessed cards. Shown only with no cached snapshot.

import { View, StyleSheet } from "react-native";
import { palette, spacing, radii, exerciseIdentity } from "@/lib/theme";
import { SectionHeader } from "@/components/ui";
import { SkeletonBlock, SkeletonCard } from "@/components/ui";

// The five seeded exercises, so the placeholder cards wear the real
// per-exercise colors a returning user already associates with the screen.
const SEEDED = ["leg-press", "back-extension", "chest-press", "seated-row", "farmers-carry"];

export function StrengthOverviewSkeleton() {
  return (
    <View accessibilityLabel="loading strength">
      <SectionHeader color={palette.strength.brand} style={styles.section}>
        THE NUMBERS TO BEAT
      </SectionHeader>
      <View style={styles.cardList}>
        {SEEDED.map((id) => {
          const accent = exerciseIdentity(id).accent;
          return (
            <SkeletonCard key={id} identity={accent} depth="loud" style={styles.exCard}>
              <SkeletonBlock width={64} height={48} radius={radii.sm} tone="bright" />
              <View style={styles.exBody}>
                <SkeletonBlock width="55%" height={16} tone="bright" />
                <SkeletonBlock width="80%" height={12} />
                <SkeletonBlock width="65%" height={12} />
              </View>
            </SkeletonCard>
          );
        })}
      </View>

      <SectionHeader style={styles.section}>SESSIONS</SectionHeader>
      <View style={styles.historyList}>
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} tone="recessed" style={styles.historyRow}>
            <View style={styles.historyMain}>
              <SkeletonBlock width={120} height={14} tone="bright" />
              <SkeletonBlock width={170} height={11} />
            </View>
            <SkeletonBlock width={52} height={20} radius={radii.pill} tone="bright" />
          </SkeletonCard>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  cardList: {
    gap: spacing.md,
  },
  exCard: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.md,
    alignItems: "center",
  },
  exBody: {
    flex: 1,
    gap: 6,
  },
  historyList: {
    gap: spacing.sm,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  historyMain: {
    flex: 1,
    gap: 6,
  },
});
