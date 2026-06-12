// Movement type registry — known types resolve to their identity + image +
// distance flag; UNKNOWN types fall back to `other` with dignity (neutral
// color + abstract image) while preserving the requested slug and a readable
// name. The distance flag gates the distance field per type.

import {
  movementType,
  MOVEMENT_TYPES,
  ACTIVITY_GRID_TYPES,
  GYM_TYPE,
} from "../lib/movementTypes";

describe("movementType registry", () => {
  it("resolves every seeded type to a definition with image + identity", () => {
    for (const t of MOVEMENT_TYPES) {
      const def = movementType(t.type);
      expect(def.type).toBe(t.type);
      expect(def.name).toBe(t.name);
      expect(def.image).toBeTruthy();
      expect(def.identity.accent).toMatch(/^#|^rgb/);
      expect(def.identity.bright).toBeTruthy();
      expect(def.identity.soft).toBeTruthy();
    }
  });

  it("gym is its own type with the amber (strength) identity", () => {
    const gym = movementType("gym");
    expect(gym.type).toBe("gym");
    expect(gym.name).toBe("Gym");
    expect(gym.identity.accent).toBe(GYM_TYPE.identity.accent);
  });

  it("flags only distance-y types as distance:true", () => {
    expect(movementType("run").distance).toBe(true);
    expect(movementType("walk").distance).toBe(true);
    expect(movementType("bike").distance).toBe(true);
    expect(movementType("swim").distance).toBe(true);
    expect(movementType("hike").distance).toBe(true);
    // Court / ball / other sports are not distance-y.
    expect(movementType("padel").distance).toBe(false);
    expect(movementType("football").distance).toBe(false);
    expect(movementType("other").distance).toBe(false);
  });

  it("falls back to the `other` identity + image for an UNKNOWN type", () => {
    const unknown = movementType("kayak");
    const other = movementType("other");
    // Same dignified default identity + image…
    expect(unknown.identity).toEqual(other.identity);
    expect(unknown.image).toBe(other.image);
    // …but keeps the real slug so logging/PATCH round-trip the right value…
    expect(unknown.type).toBe("kayak");
    // …and reads as a human name, never a raw slug.
    expect(unknown.name).toBe("Kayak");
    // Unknown types are not assumed distance-y.
    expect(unknown.distance).toBe(false);
  });

  it("title-cases a hyphenated unknown slug for display", () => {
    expect(movementType("open-water-swim").name).toBe("Open water swim");
    expect(movementType("box_jump").name).toBe("Box jump");
  });

  it("never crashes on an empty type (defaults to a readable name)", () => {
    const def = movementType("");
    expect(def.name).toBe("Activity");
    expect(def.image).toBeTruthy();
  });

  it("the quick-log grid offers every type except gym", () => {
    const slugs = ACTIVITY_GRID_TYPES.map((t) => t.type);
    expect(slugs).not.toContain("gym");
    expect(slugs).toContain("padel");
    expect(slugs).toContain("other");
    expect(ACTIVITY_GRID_TYPES.length).toBe(MOVEMENT_TYPES.length);
  });
});
