import type { Item } from "./totals";

// Pure helper for the deterministic "repeat a meal" lane. Scales an
// items array by a multiplier: grams × scale, per_100g untouched (it's
// per-100g reference nutrition, independent of portion), confidence and
// is_plant carried over verbatim. Rounding grams to 1 decimal keeps the
// numbers honest without drifting on repeated re-scales.
//
// Extracted from the route so the math is unit-tested and the mobile
// client can reuse the exact same logic when it ports the repeat flow.
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
// repeat outside this band is almost certainly a fat-fingered API call,
// not an intentional portion choice.
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
// caption, falls back to its vibe.
//
// Strip any leading "repeat of " prefix(es). Legacy repeats compounded them
// ("repeat of repeat of organic india psyllium"), so peel every layer.
export function stripRepeatPrefix(s: string | null | undefined): string {
  let out = (s ?? "").trim();
  while (/^repeat of\s+/i.test(out)) out = out.replace(/^repeat of\s+/i, "").trim();
  return out;
}

// A repeated meal keeps its source's IDENTITY — NO "repeat of" prefix. The
// prefix was wrong twice over: it compounded on re-repeat ("repeat of repeat
// of X"), and it split the recents list into duplicates of the very same
// food. Prefer the source caption, fall back to its vibe, peel any legacy
// prefix, and return null when there's nothing to carry (the copied meal_vibe
// still shows in the UI, and recents dedup keys off identity either way).
export function repeatCaption(
  sourceCaption: string | null | undefined,
  sourceVibe: string | null | undefined
): string | null {
  const cap = stripRepeatPrefix(sourceCaption);
  if (cap) return cap;
  const vibe = stripRepeatPrefix(sourceVibe);
  return vibe || null;
}
