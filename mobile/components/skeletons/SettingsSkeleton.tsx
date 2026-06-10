// Cold-start placeholder for the Settings targets form. Four labelled input
// rows + a save button, shaped like the real fields, so the form fills in
// without the bare-spinner pop. Calm food register.

import { View, StyleSheet } from "react-native";
import { spacing, radii } from "@/lib/theme";
import { SkeletonBlock } from "@/components/ui";

export function SettingsSkeleton() {
  return (
    <View accessibilityLabel="loading settings" style={styles.wrap}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.field}>
          <SkeletonBlock width={110} height={11} />
          <SkeletonBlock width="100%" height={46} radius={radii.sm} tone="bright" />
          <SkeletonBlock width="80%" height={10} />
        </View>
      ))}
      <SkeletonBlock width="100%" height={50} radius={radii.md} tone="bright" style={styles.save} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  field: {
    gap: spacing.sm,
  },
  save: {
    marginTop: spacing.sm,
  },
});
