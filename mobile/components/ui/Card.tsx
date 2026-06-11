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
//
// DEPTH SAFETY (read mobile/DESIGN.md "Depth rules"): the offset block is a
// container effect and MUST cast from an opaque rectangle. On iOS a view with
// shadowOpacity > 0 + shadowRadius 0 + a TRANSLUCENT background casts the hard
// block from the view's rendered alpha — its border stroke AND its child text
// glyphs — producing a displaced double-copy of the text (the "doubling up on
// outlines" defect). So the shadow always lives on an opaque base layer, and a
// register tint wash (e.g. strength brandSoft, food accentSoft) is rendered as
// an inner layer ON TOP of that opaque base via the `tint` prop — never as a
// translucent backgroundColor on the shadow-bearing view. Do not pass a
// translucent color through `style.backgroundColor`; use `tint`.

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
  // Drop the offset block entirely — a flat bordered surface, still on the
  // opaque base. The offset block is a TOP-LEVEL content-card privilege (meal
  // cards, exercise cards, the headline, skeletons). Supporting strips that
  // are chrome rather than content — the totals strip — go flat so the block
  // stays the signal it's meant to be. See DESIGN.md "Depth rules".
  flat?: boolean;
  // "raised" (default) sits on palette.surface; "recessed" is a quieter
  // secondary surface for nested/less-important blocks.
  tone?: "raised" | "recessed";
  // An optional translucent identity wash over the opaque base (e.g. the
  // amber brandSoft on a strength beats card, the lime accentSoft on a
  // selected food card). Rendered as an inner layer so the offset block
  // still casts from the opaque rect — NEVER set a translucent
  // backgroundColor via `style` on a shadowed card (it doubles the text).
  tint?: string;
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
  tint,
  flat = false,
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
    ...(flat ? null : offsetShadow(identity ?? palette.surfaceShadow, depth)),
    opacity: dimmed ? 0.7 : 1,
  };

  // The tint wash sits inside the border, on top of the opaque base, behind
  // the children (so text/numerals read on the wash). It is inset by the
  // chunky border width and uses the interior radius so it stays inside the
  // rounded box WITHOUT clipping the card itself — `overflow: hidden` would
  // swallow the offset shadow (it's painted outside the bounds), so we never
  // clip the shadow-bearing view; we size the wash to fit instead.
  const tintLayer = tint ? (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: tint, borderRadius: radii.md }]}
    />
  ) : null;

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [base, pressed && styles.pressed, style]}
      >
        {tintLayer}
        {children}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={[base, style]}>
      {tintLayer}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.82 },
});
