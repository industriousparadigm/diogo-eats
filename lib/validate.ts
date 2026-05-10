import type { Item } from "./types";

// Server-side runtime validation for a single Item received from the
// client (e.g. PATCH /api/meals/[id]). Validates shape, types, and
// reasonable bounds — anything failing here returns 400.
//
// This used to be inline in the API route. Extracted because it's pure
// (no I/O), high-stakes (gates DB writes), and worth a thorough test.
export function isValidItem(x: unknown): x is Item {
  if (!x || typeof x !== "object") return false;
  const i = x as Record<string, unknown>;
  if (typeof i.name !== "string" || !i.name.trim()) return false;
  if (
    typeof i.grams !== "number" ||
    !isFinite(i.grams) ||
    i.grams < 0 ||
    i.grams > 5000
  )
    return false;
  if (i.confidence !== "low" && i.confidence !== "medium" && i.confidence !== "high")
    return false;
  if (typeof i.is_plant !== "boolean") return false;
  const p = i.per_100g as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return false;
  for (const key of ["sat_fat_g", "soluble_fiber_g", "calories", "protein_g"] as const) {
    const v = p[key];
    if (typeof v !== "number" || !isFinite(v)) return false;
    if (v < 0 || v > 1000) return false;
  }
  return true;
}
