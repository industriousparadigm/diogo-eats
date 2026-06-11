// Pure helpers for creating user exercises: name validation, the three
// known measurement types, slug generation, and collision suffixing. Kept
// pure (no I/O) so the route stays thin and the rules are unit-tested the
// same way lib/strength/validate.ts is for sessions.

import type { MeasurementType } from "./types";

export const MEASUREMENT_TYPES: MeasurementType[] = [
  "weight_reps",
  "bodyweight_reps",
  "carry",
];

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;

export type CreateExerciseInput = {
  name: string;
  measurement_type: MeasurementType;
  description: string;
};

export type CreateExerciseValidation =
  | { ok: true; input: CreateExerciseInput }
  | { ok: false; error: string };

export function isMeasurementType(x: unknown): x is MeasurementType {
  return typeof x === "string" && (MEASUREMENT_TYPES as string[]).includes(x);
}

// Validate the POST body for a new exercise. Pure — the route turns a
// failure into a 400. description is optional (defaults to ""), name is
// required non-empty, measurement_type must be one of the three known.
export function validateCreateExercise(body: unknown): CreateExerciseValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "expected a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.name !== "string") {
    return { ok: false, error: "name must be a string" };
  }
  const name = b.name.trim();
  if (name.length === 0) {
    return { ok: false, error: "name is required" };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `name too long (max ${MAX_NAME_LENGTH})` };
  }

  if (!isMeasurementType(b.measurement_type)) {
    return {
      ok: false,
      error: `measurement_type must be one of: ${MEASUREMENT_TYPES.join(", ")}`,
    };
  }

  let description = "";
  if (b.description !== undefined && b.description !== null) {
    if (typeof b.description !== "string") {
      return { ok: false, error: "description must be a string" };
    }
    description = b.description.trim();
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return { ok: false, error: `description too long (max ${MAX_DESCRIPTION_LENGTH})` };
    }
  }

  return {
    ok: true,
    input: { name, measurement_type: b.measurement_type, description },
  };
}

// Case-insensitive name key for dedupe comparisons: trimmed, lowercased,
// inner whitespace collapsed to single spaces. "Hack  Squat " and
// "hack squat" compare equal.
export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Base slug from a name: lowercase, non-alphanumerics → hyphens, trimmed
// of leading/trailing hyphens, collapsed runs. "Hack Squat!" → "hack-squat".
// Falls back to "exercise" when a name is all punctuation (slug would be
// empty) — the collision suffix then disambiguates.
export function baseSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "exercise";
}

// Resolve a collision-free id from a name given the ids already in the
// catalog. First choice is the bare base slug; on collision, append
// -2, -3, ... until free. Deterministic given the same existingIds set.
export function resolveExerciseId(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const base = baseSlug(name);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
