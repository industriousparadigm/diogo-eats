// Card — the bordered + offset-shadow surface that is the app's signature.
//
// Every standalone content block (meal cards, stat strips, exercise cards,
// headline cards, settings groups) sits on a Card. It carries the chunky ink
// border + the hard offset shadow block. Pass a color identity and the border
// AND the shadow block both take that color — the dark-world equivalent of
// the print card's colored ink + offset register.
//
//   <Card>...</Card>                              neutral food card (calm)
//   <Card identity="#f59e0b" depth="loud">...</Card>  strength exercise card
//   <Card tone="recessed">...</Card>              quieter secondary surface
//
// Keep it a pure presentational wrapper — no behavior. For a tappable card,
// wrap children in a Pressable/TouchableOpacity inside, or set `as` to a
// touchable via the `onPress` passthrough below.

import { View, Pressable, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import type { ReactNode } from "react";
import { palette, borders, radii, offsetShadow } from "@/lib/theme";

type Props = {
  children: ReactNode;
  // A color identity: the border + offset-shadow block take this color.
  // Omit for the neutral ink border (the calm food default).
  identity?: string;
  // Shadow block depth. "soft" = food/calm, "loud" = strength.
  depth?: "soft" | "loud";
  // "raised" (default) sits on palette.surface; "recessed" is a quieter
  // secondary surface for nested/less-important blocks.
  tone?: "raised" | "recessed";
  // Optional dimmer for "done"/disabled states (keeps the structure, drops
  // the volume) — used by the strength picker's logged cards.
  dimmed?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  identity,
  depth = "soft",
  tone = "raised",
  dimmed = false,
  onPress,
  onLongPress,
  disabled,
  accessibilityLabel,
  style,
}: Props) {
  const base: ViewStyle = {
    backgroundColor: tone === "raised" ? palette.surface : palette.surfaceAlt,
    borderRadius: radii.lg,
    borderWidth: borders.chunky,
    borderColor: identity ?? palette.ink,
    ...offsetShadow(identity ?? palette.surfaceShadow, depth),
    opacity: dimmed ? 0.7 : 1,
  };

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [base, pressed && styles.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={[base, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.82 },
});
