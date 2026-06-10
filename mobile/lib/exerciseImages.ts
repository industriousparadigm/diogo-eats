// Bundled exercise images, keyed by the catalog's image_key.
//
// Sourced once from free-exercise-db (github.com/yuhonas/free-exercise-db)
// and committed under assets/exercises/ — never hotlinked at runtime.
// Static require() so Metro bundles them into the update.

import type { ImageSourcePropType } from "react-native";

const images: Record<string, ImageSourcePropType> = {
  "leg-press": require("../assets/exercises/leg-press.jpg"),
  "back-extension": require("../assets/exercises/back-extension.jpg"),
  "chest-press": require("../assets/exercises/chest-press.jpg"),
  "seated-row": require("../assets/exercises/seated-row.jpg"),
  "farmers-carry": require("../assets/exercises/farmers-carry.jpg"),
};

export function exerciseImage(imageKey: string): ImageSourcePropType | null {
  return images[imageKey] ?? null;
}
