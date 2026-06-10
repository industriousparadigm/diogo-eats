// The deterministic "log again" affordance — native sibling of the web's
// RepeatButton. Tapping reveals an inline scale picker (½ · 1× · 2×);
// picking one re-logs the source meal verbatim at that scale (no Vision
// call) via the caller's onRepeat(scale). Lives on the meal card and the
// meal detail surface.
//
// Same restraint as the rest of the app: a quiet chip at rest, lime accent
// only on the 1× default, the soft `bad` tone (never real red) on failure.

import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "@/lib/colors";

type Props = {
  onRepeat: (scale: number) => Promise<void>;
  variant?: "card" | "detail";
};

const SCALES: Array<[string, number]> = [
  ["½", 0.5],
  ["1×", 1],
  ["2×", 2],
];

export function RepeatButton({ onRepeat, variant = "card" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const detail = variant === "detail";

  async function pick(scale: number) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await onRepeat(scale);
      setOpen(false);
    } catch {
      // Collapse back to the chip so the soft "try again" state is visible
      // (tapping it re-opens the picker for another go).
      setError(true);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityLabel="log this meal again"
        style={[styles.chip, detail && styles.chipDetail, error && styles.chipError]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text
          style={[
            styles.chipText,
            detail && styles.chipTextDetail,
            error && styles.chipTextError,
          ]}
        >
          {error ? "try again" : "↻ again"}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.picker}>
      {SCALES.map(([label, scale]) => {
        const isDefault = scale === 1;
        return (
          <TouchableOpacity
            key={label}
            onPress={() => pick(scale)}
            disabled={busy}
            activeOpacity={0.7}
            accessibilityLabel={`log again at ${label}`}
            style={[
              styles.scaleBtn,
              detail && styles.scaleBtnDetail,
              isDefault && styles.scaleBtnDefault,
              busy && styles.dim,
            ]}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text
              style={[
                styles.scaleText,
                detail && styles.scaleTextDetail,
                isDefault && styles.scaleTextDefault,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        onPress={() => {
          setOpen(false);
          setError(false);
        }}
        disabled={busy}
        accessibilityLabel="cancel repeat"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={styles.cancelBtn}
      >
        <Text style={styles.cancelText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  chipDetail: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipError: {
    borderColor: colors.bad,
  },
  chipText: {
    fontSize: 11,
    color: colors.textSubtle,
    letterSpacing: 0.3,
  },
  chipTextDetail: {
    fontSize: 12,
  },
  chipTextError: {
    color: colors.bad,
  },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scaleBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  scaleBtnDetail: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scaleBtnDefault: {
    backgroundColor: "rgba(132,204,22,0.12)",
    borderColor: "rgba(132,204,22,0.30)",
  },
  scaleText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
  },
  scaleTextDetail: {
    fontSize: 12,
  },
  scaleTextDefault: {
    color: colors.accentLight,
  },
  dim: {
    opacity: 0.5,
  },
  cancelBtn: {
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 13,
    color: colors.textFaint,
  },
});
