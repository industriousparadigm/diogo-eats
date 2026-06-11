// ExerciseImage — the one way to render an exercise's photo slot.
//
// image_key is `string | null` (a user-created exercise has no bundled
// asset, and a key we haven't bundled yet resolves to null too). Every
// surface that showed an exercise photo used `{img && <Image/>}`, which
// silently rendered NOTHING for a null key — leaving a ragged hole where
// the inked image frame should sit. This component closes that: a real
// asset renders the bundled photo; a missing one renders a placeholder
// that keeps the same inked frame (white-on-ink, like the photos sit) with
// a dumbbell glyph, so a user-created exercise reads as a proper card, not
// a broken one. It never crashes on null/unknown.
//
//   <ExerciseImage imageKey={ex.image_key} style={styles.exImage} />
//
// `style` carries the per-surface size (picker 72×52, overview 64×48, the
// hero 88×64 / 96×70, session detail 56×42) plus the inked frame each
// screen already defined — this component just chooses photo vs placeholder.

import { View, Text, Image, StyleSheet, type ImageStyle, type StyleProp } from "react-native";
import { palette, fontSize } from "@/lib/theme";
import { exerciseImage } from "@/lib/exerciseImages";

type Props = {
  imageKey: string | null | undefined;
  // The surface's frame style (size + border/radius). Reused for both the
  // real image and the placeholder so they occupy the identical slot.
  style: StyleProp<ImageStyle>;
  // Dim the slot for a done/disabled card (matches the picker's logged state).
  dimmed?: boolean;
};

export function ExerciseImage({ imageKey, style, dimmed }: Props) {
  const src = exerciseImage(imageKey);
  if (src) {
    return <Image source={src} style={[style, dimmed && styles.dimmed]} />;
  }
  return (
    <View
      style={[style, styles.placeholder, dimmed && styles.dimmed]}
      accessibilityLabel="no exercise image"
    >
      <Text style={styles.glyph}>🏋︎</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits in the same inked frame the photos use, but on a muted fill so an
  // imageless card still reads as "a card with an image slot", not a gap.
  placeholder: {
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    fontSize: fontSize.lead,
    color: palette.textSubtle,
  },
  dimmed: {
    opacity: 0.5,
  },
});
