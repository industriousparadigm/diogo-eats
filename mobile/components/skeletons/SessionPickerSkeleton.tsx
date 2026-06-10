// Cold-start placeholder for the live-session picker (booting a fresh draft
// from the overview fetch). Skeleton exercise cards in the loud register,
// matching the picker's machine cards, so the gym-floor flow never opens on
// a bare spinner. Shown only while booting with no existing draft.

import { View, StyleSheet } from "react-native";
import { spacing, radii, exerciseIdentity } from "@/lib/theme";
import { SkeletonBlock, SkeletonCard } from "@/components/ui";

const SEEDED = ["leg-press", "back-extension", "chest-press", "seated-row", "farmers-carry"];

export function SessionPickerSkeleton() {
  return (
    <View accessibilityLabel="loading session" style={styles.wrap}>
      {SEEDED.map((id) => {
        const accent = exerciseIdentity(id).accent;
        return (
          <SkeletonCard key={id} identity={accent} depth="loud" style={styles.card}>
            <SkeletonBlock width={72} height={52} radius={radii.sm} tone="bright" />
            <View style={styles.body}>
              <SkeletonBlock width="50%" height={16} tone="bright" />
              <SkeletonBlock width="75%" height={12} />
            </View>
          </SkeletonCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  body: {
    flex: 1,
    gap: 6,
  },
});
