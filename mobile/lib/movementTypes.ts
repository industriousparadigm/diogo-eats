// Movement type registry — the identity bank for "how I moved".
//
// THE POP (see DESIGN.md "Movement type identity"): every movement type
// carries three things so its card reads instantly as itself —
//   1. a display NAME ("Padel", "Run", "Gym"),
//   2. a COLOR identity ({ accent, bright, soft }) from the loud
//      movement/exercise family — the chunky border + offset block + the
//      tint wash + the bright numeral color, and
//   3. a bundled photographic IMAGE (require()'d so Metro ships it; never
//      hotlinked), photographic + energetic, hard against the inked edge.
//
// GYM IS A TYPE. The strength scoreboard is one kind of movement; it keeps
// amber (palette.strength.brand) so a gym card and a strength surface read
// as the same thing. The synthetic gym "type" never round-trips to the
// activities API — it's only how a strength session paints itself in the
// union timeline (lib/movementTimeline.ts).
//
// UNKNOWN TYPES RENDER WITH DIGNITY. The server's whitelist will grow
// (padel/run/walk/bike/swim/football/hike/other today, more tomorrow). Any
// type not in this map resolves to the `other` identity (a neutral violet +
// the abstract-motion image), so a future "kayak" shows a proper card, not
// a blank one — no code change required to avoid a crash.

import type { ImageSourcePropType } from "react-native";
import { palette } from "./theme";

export type MovementIdentity = {
  // The chunky border + offset block + numeral color family.
  accent: string;
  // A brighter sibling for the big numeral so it pops on the card.
  bright: string;
  // The opaque-safe tint wash (passed as Card `tint`, never as a
  // translucent backgroundColor — see DESIGN.md "Depth rules").
  soft: string;
};

// How a type is logged when picked from the front-door grid. Most types take
// the quick-log form (duration/effort/note → one POST). Gym is different: it
// routes into the live session flow (the gym-floor scoreboard), so picking it
// closes the sheet and starts a session instead of showing a form. New
// special types are registry entries with their own entryMode, never an
// if-chain in the sheet.
export type MovementEntryMode = "live-session" | "quick-log";

export type MovementTypeDef = {
  // The canonical slug (matches the server's whitelist; "gym" is synthetic).
  type: string;
  // Title-case display name for cards/grids.
  name: string;
  identity: MovementIdentity;
  image: ImageSourcePropType;
  // Distance-y types show a distance field in the quick-log + a distance
  // metric on the card. Non-distance types hide it entirely (no "0 km").
  distance: boolean;
  // What picking this type in the grid does. "quick-log" → the form;
  // "live-session" (gym) → close + route into the live session flow.
  entryMode: MovementEntryMode;
};

// The bundled images. Static require() so Metro bundles them into the
// update — never a runtime URL. Optimized to ≤200KB each, 3:2 landscape,
// matching the exercise assets. Procured from openly-licensed sources
// (Pexels free license — bundling permitted, no attribution required).
const IMG = {
  padel: require("../assets/movement/padel.jpg"),
  run: require("../assets/movement/run.jpg"),
  walk: require("../assets/movement/walk.jpg"),
  bike: require("../assets/movement/bike.jpg"),
  swim: require("../assets/movement/swim.jpg"),
  football: require("../assets/movement/football.jpg"),
  hike: require("../assets/movement/hike.jpg"),
  gym: require("../assets/movement/gym.jpg"),
  other: require("../assets/movement/other.jpg"),
} as const;

// The non-gym activity registry. Order here is the quick-log GRID order after
// gym (padel first — the owner's real first activity). Every one is a
// quick-log type (duration form → one POST).
export const MOVEMENT_TYPES: MovementTypeDef[] = [
  { type: "padel", name: "Padel", identity: palette.movement.padel, image: IMG.padel, distance: false, entryMode: "quick-log" },
  { type: "run", name: "Run", identity: palette.movement.run, image: IMG.run, distance: true, entryMode: "quick-log" },
  { type: "walk", name: "Walk", identity: palette.movement.walk, image: IMG.walk, distance: true, entryMode: "quick-log" },
  { type: "bike", name: "Bike", identity: palette.movement.bike, image: IMG.bike, distance: true, entryMode: "quick-log" },
  { type: "swim", name: "Swim", identity: palette.movement.swim, image: IMG.swim, distance: true, entryMode: "quick-log" },
  { type: "football", name: "Football", identity: palette.movement.football, image: IMG.football, distance: false, entryMode: "quick-log" },
  { type: "hike", name: "Hike", identity: palette.movement.hike, image: IMG.hike, distance: true, entryMode: "quick-log" },
  { type: "other", name: "Other", identity: palette.movement.other, image: IMG.other, distance: false, entryMode: "quick-log" },
];

// The synthetic GYM identity — a strength session painted into the union
// timeline. Amber, the strength brand, so it reads as the scoreboard it is.
// entryMode "live-session": picking it routes into the live session flow
// (no quick-log form), because a gym sesh is its own scoreboard.
export const GYM_TYPE: MovementTypeDef = {
  type: "gym",
  name: "Gym",
  identity: {
    accent: palette.strength.brand,
    bright: palette.strength.brandBright,
    soft: palette.strength.brandSoft,
  },
  image: IMG.gym,
  distance: false,
  entryMode: "live-session",
};

// The "+ log movement" GRID: ONE front door. Gym leads (the gym-floor
// lifeline is the most-logged movement), then every activity type. Gym is a
// card here, not a separate hero — picking it routes into the session flow
// (entryMode "live-session"); everything else shows the quick-log form.
export const GRID_TYPES: MovementTypeDef[] = [GYM_TYPE, ...MOVEMENT_TYPES];

const BY_TYPE: Record<string, MovementTypeDef> = (() => {
  const m: Record<string, MovementTypeDef> = { gym: GYM_TYPE };
  for (const t of MOVEMENT_TYPES) m[t.type] = t;
  return m;
})();

// Resolve a type slug to its definition. THE DIGNIFIED DEFAULT: an unknown
// type (a future server addition the app hasn't shipped a tile for yet, or
// a typo'd row) falls back to `other` — neutral violet + the abstract image
// — but keeps the requested slug as its `type` so logging/PATCH round-trip
// the real value, and capitalizes the unknown slug as a readable name.
export function movementType(type: string): MovementTypeDef {
  const known = BY_TYPE[type];
  if (known) return known;
  const other = BY_TYPE.other;
  return {
    ...other,
    type,
    name: titleCase(type),
  };
}

// "open-water-swim" → "Open water swim". Plain, never an opaque slug on a
// card.
function titleCase(slug: string): string {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "Activity";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
