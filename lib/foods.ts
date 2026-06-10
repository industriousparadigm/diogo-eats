import type { Per100g } from "./vision";
import type { Provenance } from "./db";

// Pure helpers for the foods-library surface. Kept here (no I/O) so the
// validation + display logic is unit-tested and reusable by the mobile
// wave, which will port the /foods UI.

const REQUIRED_PER_100G = [
  "sat_fat_g",
  "soluble_fiber_g",
  "calories",
  "protein_g",
] as const;

const OPTIONAL_PER_100G = ["fat_g", "carbs_g", "sugar_g", "salt_g", "alcohol_g"] as const;

// Validates a per_100g object received from the client (manual add, food
// edit). Required nutrients must be finite numbers in [0, 1000]; optional
// silent-capture nutrients, when present, share the same bound.
export function isValidPer100g(x: unknown): x is Per100g {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  for (const key of REQUIRED_PER_100G) {
    const v = p[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1000) return false;
  }
  for (const key of OPTIONAL_PER_100G) {
    if (p[key] === undefined) continue;
    const v = p[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1000) return false;
  }
  return true;
}

export const PROVENANCE_VALUES: Provenance[] = [
  "label_verified",
  "user_corrected",
  "ai_inferred",
];

export function isProvenance(x: unknown): x is Provenance {
  return typeof x === "string" && (PROVENANCE_VALUES as string[]).includes(x);
}

// Short human label for a provenance badge in the UI. Plain language, no
// codes — "from label" / "you confirmed" / "ai guess".
export function provenanceLabel(p: Provenance): string {
  switch (p) {
    case "label_verified":
      return "from label";
    case "user_corrected":
      return "you confirmed";
    case "ai_inferred":
    default:
      return "ai guess";
  }
}

// A nutrition label read is "usable" only if it has real numbers. The
// LABEL_SYSTEM prompt zeroes everything when the image isn't a readable
// label, so a usable entry needs at least calories OR a macro present.
export function isUsableLabel(per100g: Per100g, name: string): boolean {
  if (!name || name.trim().toLowerCase() === "unreadable label") return false;
  const anyMacro =
    (per100g.calories ?? 0) > 0 ||
    (per100g.protein_g ?? 0) > 0 ||
    (per100g.fat_g ?? 0) > 0 ||
    (per100g.carbs_g ?? 0) > 0;
  return anyMacro;
}
