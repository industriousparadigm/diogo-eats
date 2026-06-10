// Skeleton — loading placeholders born in the Eats design language.
//
// THE RULE (mobile/DESIGN.md + the loading-states wave): a data surface
// NEVER renders an empty state before its first fetch resolves. While it
// loads it shows skeletons shaped like the content they precede — and
// those skeletons wear the same DNA as everything else: chunky inked
// borders, the hard offset-shadow block, theme tokens. No generic gray
// shimmer, no blur, no new deps.
//
// Two building blocks:
//   <SkeletonBlock />  a single inked bar/box (text line, image, chip).
//                      Pulses opacity via Animated (the only motion the
//                      design allows here — subtle, no shimmer sweep).
//   <SkeletonCard />   a Card-shaped placeholder: the signature border +
//                      offset block, so a loading list reads as cards.
//
// `identity`/`depth` mirror Card so strength skeletons can wear a color
// identity + loud shadow and food skeletons stay calm/neutral.

import { useEffect, useRef } from "react";
import { Animated, View, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import type { ReactNode } from "react";
import { palette, borders, radii, offsetShadow } from "@/lib/theme";

// One shared pulse driver per mounted block. Cheap (native driver, opacity
// only) and the gentle 0.45→0.85 range reads as "working", never a flash.
function usePulse() {
  const v = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

// A single inked placeholder bar/box. `tone="bright"` is a slightly lighter
// fill for a placeholder that sits ON a card (text lines on surface); the
// default sits on the app bg.
export function SkeletonBlock({
  width,
  height = 12,
  radius = radii.xs,
  tone = "default",
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  tone?: "default" | "bright";
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = usePulse();
  return (
    <Animated.View
      accessibilityLabel="loading"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: tone === "bright" ? palette.surfaceMuted : palette.surfaceAlt,
          opacity,
        },
        style,
      ]}
    />
  );
}

// A Card-shaped skeleton: the chunky border + hard offset block, so a
// loading surface reads as the cards it precedes — not a floating gray box.
export function SkeletonCard({
  children,
  identity,
  depth = "soft",
  tone = "raised",
  style,
}: {
  children?: ReactNode;
  identity?: string;
  depth?: "soft" | "loud";
  tone?: "raised" | "recessed";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessibilityLabel="loading"
      style={[
        {
          backgroundColor: tone === "raised" ? palette.surface : palette.surfaceAlt,
          borderRadius: radii.lg,
          borderWidth: borders.chunky,
          borderColor: identity ?? palette.ink,
          ...offsetShadow(identity ?? palette.surfaceShadow, depth),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({});
