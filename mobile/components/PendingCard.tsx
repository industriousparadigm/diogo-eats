// Optimistic "parsing..." card shown while a photo/text parse is in flight.
// If it fails, shows the error + retry affordance.
// The pending state NEVER persists across app sessions — it's lost if
// the app is killed. The Today screen reconciles on foreground resume.

import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { Card } from "@/components/ui";

export type PendingState = {
  id: string;
  kind: "photo" | "text";
  previewUri?: string;
  caption?: string;
  text?: string;
  photoCount?: number;
  // When backfilling into a past day: the YYYY-MM-DD the parse targets.
  forDate?: string;
  status: "processing" | "error";
  errorMessage?: string;
};

type Props = {
  pending: PendingState;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
};

export function PendingCard({ pending, onRetry, onDismiss }: Props) {
  const isError = pending.status === "error";

  return (
    <Card identity={isError ? palette.danger : undefined} style={styles.card}>
      <View style={styles.inner}>
        {/* Preview / icon */}
        {pending.previewUri ? (
          <View>
            <Image
              source={{ uri: pending.previewUri }}
              style={styles.thumb}
              contentFit="cover"
            />
            {(pending.photoCount ?? 1) > 1 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>+{(pending.photoCount ?? 1) - 1}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.thumb, styles.textIcon]}>
            <Text style={styles.textIconLabel}>T</Text>
          </View>
        )}

        {/* Status */}
        <View style={styles.content}>
          {isError ? (
            <>
              <Text style={styles.errorTitle}>Parse failed</Text>
              <Text style={styles.errorMsg} numberOfLines={2}>
                {pending.errorMessage ?? "Something went wrong"}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => onRetry(pending.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => onDismiss(pending.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.processingRow}>
                <ActivityIndicator size="small" color={palette.food.accent} />
                <Text style={styles.processingText}>Reading the plate...</Text>
              </View>
              {pending.caption && (
                <Text style={styles.captionHint} numberOfLines={1}>
                  {pending.caption}
                </Text>
              )}
              {pending.text && (
                <Text style={styles.captionHint} numberOfLines={1}>
                  {pending.text}
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  inner: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.md,
    alignItems: "center",
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radii.sm,
    flexShrink: 0,
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  textIcon: {
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  textIconLabel: {
    color: palette.textSubtle,
    fontSize: fontSize.lead,
    fontWeight: "700",
  },
  countBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  countText: {
    color: palette.text,
    fontSize: fontSize.label,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    gap: spacing.sm,
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  processingText: {
    fontSize: fontSize.body,
    color: palette.textMuted,
  },
  captionHint: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    fontStyle: "italic",
  },
  errorTitle: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.danger,
  },
  errorMsg: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  retryButton: {
    backgroundColor: palette.food.accent,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  retryText: {
    fontSize: fontSize.caption,
    fontWeight: "800",
    color: palette.onAccent,
  },
  dismissButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dismissText: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
  },
});
