// Bundled exercise images, keyed by the catalog's image_key.
//
// Sourced once from free-exercise-db (github.com/yuhonas/free-exercise-db)
// and committed under assets/exercises/ — never hotlinked at runtime.
// Static require() so Metro bundles them into the update.
//
// image_key is `string | null`: null = a user-created exercise with no
// bundled asset, and an unknown key = an asset that hasn't been bundled
// yet. Both return null here and the UI renders a placeholder (see the
// shared ExerciseImage component) — never a crash.

import type { ImageSourcePropType } from "react-native";

const images: Record<string, ImageSourcePropType> = {
  "leg-press": require("../assets/exercises/leg-press.jpg"),
  "back-extension": require("../assets/exercises/back-extension.jpg"),
  "chest-press": require("../assets/exercises/chest-press.jpg"),
  "seated-row": require("../assets/exercises/seated-row.jpg"),
  "farmers-carry": require("../assets/exercises/farmers-carry.jpg"),
  "tricep-pulley": require("../assets/exercises/tricep-pulley.jpg"),
};

export function exerciseImage(
  imageKey: string | null | undefined
): ImageSourcePropType | null {
  if (!imageKey) return null;
  return images[imageKey] ?? null;
}
