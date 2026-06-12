// MovementImage — the one way to render a movement type's photo slot.
//
// Unlike ExerciseImage (whose key can be null → placeholder), a movement
// type ALWAYS resolves to a bundled image via the registry (unknown types
// fall back to `other`'s photo). So this is a thin, never-empty wrapper that
// keeps the inked-frame treatment consistent across the grid, the timeline
// cards, and the detail sheet — the photo hard against the identity edge,
// the day-1-card DNA.
//
//   <MovementImage type="padel" style={styles.cardImage} />

import { Image, StyleSheet, type ImageStyle, type StyleProp } from "react-native";
import { movementType } from "@/lib/movementTypes";

type Props = {
  type: string;
  // The surface's frame style (size + radius). The image fills it.
  style: StyleProp<ImageStyle>;
  dimmed?: boolean;
};

export function MovementImage({ type, style, dimmed }: Props) {
  const def = movementType(type);
  return (
    <Image
      source={def.image}
      style={[style, dimmed && styles.dimmed]}
      accessibilityLabel={`${def.name} image`}
    />
  );
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.5 },
});
