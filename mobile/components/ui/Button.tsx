// Button — the action hierarchy, one component.
//
//   variant="primary"    filled in a register accent, black ink label
//                        (Log it, Save targets, Session complete, Start)
//   variant="secondary"  chunky-bordered, transparent fill (Library, cancel)
//   variant="ghost"      dashed-bordered affordance (+ add food, + add series)
//   variant="danger"     destructive fill (delete confirm)
//
// Pass `accent` to recolor a primary/secondary (strength uses amber, food
// uses lime; an exercise screen uses its identity color).
//
// DEPTH: buttons are FLAT — controls, not content cards. The hard offset
// block is a top-level content-card privilege (meal/exercise cards, the
// headline, skeletons); a button earns its weight from the filled accent +
// the black-ink label, not a shadow. See DESIGN.md "Depth rules" (item: the
// block is a major-card privilege).

import {
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { palette, radii, borders, fontSize } from "@/lib/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  accent?: string; // overrides the fill (primary) / border+text (secondary)
  disabled?: boolean;
  loading?: boolean;
  // A small hint line under the label (Resume session "a session is in progress").
  hint?: string;
  // Slightly taller hero button (Start session, Log it).
  size?: "md" | "lg";
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  accent,
  disabled,
  loading,
  hint,
  size = "md",
  accessibilityLabel,
  style,
}: Props) {
  const a = accent ?? palette.food.accent;
  const pad = size === "lg" ? 17 : 14;

  let container: ViewStyle = {};
  let labelColor: string = palette.text;

  if (variant === "primary") {
    container = { backgroundColor: a, borderRadius: radii.md };
    labelColor = palette.onAccent;
  } else if (variant === "secondary") {
    container = {
      backgroundColor: "transparent",
      borderWidth: borders.bold,
      borderColor: a,
      borderRadius: radii.md,
    };
    labelColor = a;
  } else if (variant === "ghost") {
    container = {
      backgroundColor: "transparent",
      borderWidth: borders.hairline,
      borderStyle: "dashed",
      borderColor: palette.borderDashed,
      borderRadius: radii.sm,
    };
    labelColor = palette.textMuted;
  } else {
    container = { backgroundColor: palette.dangerStrong, borderRadius: radii.md };
    labelColor = palette.white;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.base,
        container,
        { paddingVertical: pad },
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <View style={styles.labelWrap}>
          <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
          {hint ? <Text style={[styles.hint, { color: labelColor }]}>{hint}</Text> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  labelWrap: { alignItems: "center", gap: 2 },
  label: { fontSize: fontSize.title, fontWeight: "800", letterSpacing: -0.2 },
  hint: { fontSize: fontSize.label, fontWeight: "600", opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
