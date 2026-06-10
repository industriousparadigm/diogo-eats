// Pure helpers + types for the foods-library surface. Ported from the
// web's lib/foods.ts (validation + display) so the rules can't drift
// between clients. No I/O — the API client (lib/api.ts) does the HTTP.

import type { Per100g } from "./types";

export type Provenance = "label_verified" | "user_corrected" | "ai_inferred";

export type PortionPreset = { label: string; grams: number };

// A library food, as returned by GET /api/foods. name_key is the opaque
// per-user stable id (passed back verbatim as the [id] for edit/delete/
// compose). per_100g_json is a JSON string of a Per100g.
export type Food = {
  name_key: string;
  display_name: string;
  is_plant: 0 | 1;
  per_100g_json: string;
  times_seen: number;
  last_seen: number;
  provenance: Provenance;
  portion_presets: PortionPreset[] | null;
};

const REQUIRED_PER_100G = [
  "sat_fat_g",
  "soluble_fiber_g",
  "calories",
  "protein_g",
] as const;

const OPTIONAL_PER_100G = ["fat_g", "carbs_g", "sugar_g", "salt_g", "alcohol_g"] as const;

// Validates a per_100g object before a manual add / edit. Required
// nutrients must be finite numbers in [0, 1000]; optional silent-capture
// nutrients, when present, share the same bound. Mirrors the server.
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

// Short human label for a provenance badge. Plain language, no codes.
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

// Parse a Food's per_100g_json, defaulting to zeroes on any failure.
export function parsePer100g(raw: string): Per100g {
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object") return p as Per100g;
  } catch {
    // fall through
  }
  return { sat_fat_g: 0, soluble_fiber_g: 0, calories: 0, protein_g: 0 };
}
