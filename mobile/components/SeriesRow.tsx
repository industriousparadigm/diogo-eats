// One series row in the strength entry screen: weight + reps steppers,
// pre-filled with last time's numbers, and a confirm check. Logging a
// set is "confirm or nudge" — ideally 2-4 taps. Values are also directly
// editable (numeric keypad) for big jumps like 32 -> 39.

import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { palette, radii, borders, fontSize, condensedFamily } from "@/lib/theme";
import { tapConfirm } from "@/lib/haptics";
import { repsUnit, weightUnit } from "@/lib/strengthFormat";
import type { MeasurementType } from "@/lib/strengthTypes";
import type { DraftSeries } from "@/lib/strengthSession";

type Props = {
  index: number; // 0-based
  series: DraftSeries;
  type: MeasurementType;
  accent: string;
  canConfirm: boolean;
  onWeight: (weight: number | null) => void;
  onReps: (reps: number) => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
};

export function SeriesRow({
  index,
  series,
  type,
  accent,
  canConfirm,
  onWeight,
  onReps,
  onConfirm,
  onUnconfirm,
}: Props) {
  const repsStep = type === "carry" ? 5 : 1;
  const showWeight = type !== "bodyweight_reps";

  return (
    <View
      style={[
        styles.row,
        series.confirmed && { borderColor: accent, backgroundColor: palette.surface },
      ]}
    >
      <Text style={[styles.seriesLabel, series.confirmed && { color: accent }]}>
        S{index + 1}
      </Text>

      {showWeight ? (
        <Stepper
          value={series.weight_kg}
          unit={weightUnit(type)}
          step={1}
          allowDecimal
          placeholder="kg"
          onChange={(v) => onWeight(v)}
          accessibilityPrefix={`series ${index + 1} weight`}
        />
      ) : (
        <View style={styles.bwBox}>
          <Text style={styles.bwText}>BODY{"\n"}WEIGHT</Text>
        </View>
      )}

      <Stepper
        value={series.reps}
        unit={repsUnit(type)}
        step={repsStep}
        placeholder="reps"
        onChange={(v) => onReps(v ?? 0)}
        accessibilityPrefix={`series ${index + 1} ${repsUnit(type)}`}
      />

      <TouchableOpacity
        style={[
          styles.confirmBtn,
          series.confirmed && { backgroundColor: accent, borderColor: accent },
          !series.confirmed && !canConfirm && styles.confirmBtnDisabled,
        ]}
        onPress={() => {
          if (series.confirmed) {
            onUnconfirm();
          } else {
            tapConfirm();
            onConfirm();
          }
        }}
        disabled={!series.confirmed && !canConfirm}
        accessibilityLabel={
          series.confirmed
            ? `series ${index + 1} confirmed, tap to undo`
            : `confirm series ${index + 1}`
        }
      >
        <Text
          style={[
            styles.confirmText,
            series.confirmed && styles.confirmTextDone,
          ]}
        >
          ✓
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function Stepper({
  value,
  unit,
  step,
  allowDecimal = false,
  placeholder,
  onChange,
  accessibilityPrefix,
}: {
  value: number | null;
  unit: string;
  step: number;
  allowDecimal?: boolean;
  placeholder: string;
  onChange: (v: number | null) => void;
  accessibilityPrefix: string;
}) {
  // Local text state so partial input ("", "3.") doesn't fight the
  // numeric draft while typing; syncs back from props when the draft
  // changes (e.g. stepper buttons).
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setText(value === null ? "" : String(value));
  }, [value]);

  function commitText(t: string) {
    const n = allowDecimal ? parseFloat(t) : parseInt(t, 10);
    if (isFinite(n) && n > 0) {
      onChange(allowDecimal ? Math.round(n * 10) / 10 : n);
    } else {
      onChange(null);
    }
  }

  function nudge(delta: number) {
    const base = value ?? 0;
    const next = Math.max(0, Math.round((base + delta) * 10) / 10);
    onChange(next > 0 ? next : null);
  }

  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => nudge(-step)}
        accessibilityLabel={`${accessibilityPrefix} minus ${step}`}
        hitSlop={{ top: 8, bottom: 8 }}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </TouchableOpacity>
      <View style={styles.valueWrap}>
        <TextInput
          style={styles.valueInput}
          value={text}
          onChangeText={setText}
          onEndEditing={(e) => commitText(e.nativeEvent.text)}
          keyboardType={allowDecimal ? "decimal-pad" : "number-pad"}
          placeholder={placeholder}
          placeholderTextColor={palette.textFaint}
          accessibilityLabel={`${accessibilityPrefix} value`}
        />
        <Text style={styles.unitText}>{unit}</Text>
      </View>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => nudge(step)}
        accessibilityLabel={`${accessibilityPrefix} plus ${step}`}
        hitSlop={{ top: 8, bottom: 8 }}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.surfaceAlt,
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.md,
    padding: 10,
  },
  seriesLabel: {
    fontSize: fontSize.caption,
    fontWeight: "800",
    color: palette.textSubtle,
    width: 24,
  },
  stepper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.sm,
    borderWidth: borders.hairline,
    borderColor: palette.inkSoft,
  },
  stepBtn: {
    width: 36,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: {
    fontSize: 20,
    color: palette.textMuted,
    fontWeight: "600",
  },
  valueWrap: {
    flex: 1,
    alignItems: "center",
  },
  valueInput: {
    fontFamily: condensedFamily,
    color: palette.text,
    fontSize: fontSize.lead,
    fontWeight: "800",
    textAlign: "center",
    paddingVertical: 4,
    minWidth: 40,
    fontVariant: ["tabular-nums"],
  },
  unitText: {
    fontSize: 8,
    color: palette.textSubtle,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: -3,
    marginBottom: 4,
  },
  bwBox: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.sm,
    borderWidth: borders.hairline,
    borderColor: palette.inkSoft,
  },
  bwText: {
    fontSize: 9,
    color: palette.textSubtle,
    letterSpacing: 1,
    textAlign: "center",
    lineHeight: 12,
  },
  confirmBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.35,
  },
  confirmText: {
    fontSize: 20,
    color: palette.textSubtle,
    fontWeight: "700",
  },
  confirmTextDone: {
    color: palette.onAccent,
  },
});
