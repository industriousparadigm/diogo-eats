// Optimistic "parsing..." card shown while a photo/text parse is in flight.
// If it fails, shows the error + retry affordance.
// The pending state NEVER persists across app sessions — it's lost if
// the app is killed. The Today screen reconciles on foreground resume.

import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { colors, radii } from "@/lib/colors";

export type PendingState = {
  id: string;
  kind: "photo" | "text";
  previewUri?: string;
  caption?: string;
  text?: string;
  photoCount?: number;
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
    <View style={[styles.card, isError && styles.cardError]}>
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
                <ActivityIndicator size="small" color={colors.brand} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardError: {
    borderColor: colors.bad,
  },
  inner: {
    flexDirection: "row",
    padding: 12,
    gap: 12,
    alignItems: "center",
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    flexShrink: 0,
  },
  textIcon: {
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  textIconLabel: {
    color: colors.textSubtle,
    fontSize: 18,
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
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    gap: 6,
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  processingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  captionHint: {
    fontSize: 12,
    color: colors.textSubtle,
    fontStyle: "italic",
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.bad,
  },
  errorMsg: {
    fontSize: 12,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  retryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.bg,
  },
  dismissButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dismissText: {
    fontSize: 13,
    color: colors.textSubtle,
  },
});
