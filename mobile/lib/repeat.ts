// Pure helpers for the deterministic "repeat a meal" lane — ported
// verbatim from the web's lib/repeat.ts so the math is identical on both
// clients. Scales an items array by a multiplier: grams × scale, per_100g
// untouched (it's per-100g reference nutrition, independent of portion),
// confidence and is_plant carried over. Rounding grams to 1 decimal keeps
// the numbers honest without drifting on repeated re-scales.

import type { Item } from "./types";

export function repeatMeal(items: Item[], scale: number): Item[] {
  return items.map((it) => ({
    name: it.name,
    grams: Math.round(it.grams * scale * 10) / 10,
    confidence: it.confidence,
    is_plant: it.is_plant,
    per_100g: it.per_100g,
  }));
}

// Allowed scale range for a repeat (matches the route's validation). A
// repeat outside this band is almost certainly a fat-fingered call, not
// an intentional portion choice.
export const REPEAT_SCALE_MIN = 0.1;
export const REPEAT_SCALE_MAX = 5;

export function isValidRepeatScale(scale: unknown): scale is number {
  return (
    typeof scale === "number" &&
    Number.isFinite(scale) &&
    scale >= REPEAT_SCALE_MIN &&
    scale <= REPEAT_SCALE_MAX
  );
}

// Honest + searchable caption for a repeated meal. Prefers the source
// caption, falls back to its vibe. Mirrors the server (lib/repeat.ts).
//
// Peel any leading "repeat of " prefix(es) — legacy repeats compounded them.
export function stripRepeatPrefix(s: string | null | undefined): string {
  let out = (s ?? "").trim();
  while (/^repeat of\s+/i.test(out)) out = out.replace(/^repeat of\s+/i, "").trim();
  return out;
}

// A repeated meal keeps its source's identity — NO "repeat of" prefix (it
// compounded on re-repeat and split the recents list into duplicates). Source
// caption, else vibe, prefix peeled; null when empty (the copied vibe shows).
export function repeatCaption(
  sourceCaption: string | null | undefined,
  sourceVibe: string | null | undefined
): string | null {
  const cap = stripRepeatPrefix(sourceCaption);
  if (cap) return cap;
  const vibe = stripRepeatPrefix(sourceVibe);
  return vibe || null;
}
