import { tzDayStart, todayYmd, addDaysYmd, APP_TZ } from "./tz";
import { stripRepeatPrefix } from "./repeat";

// Pure helpers for GET /api/meals/recent — kept I/O-free so the window +
// clamp math is unit-tested. The route resolves the user, calls these,
// then hits getRecentMeals(userId, sinceMs, limit).

export const RECENT_DEFAULT_DAYS = 14;
export const RECENT_MAX_DAYS = 60;
export const RECENT_DEFAULT_LIMIT = 50;
export const RECENT_MAX_LIMIT = 100;

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw == null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Parse the ?days & ?limit query params into a clamped window. Returns the
// number of days back and the row limit; both bounded so a fat-fingered
// caller can't pull the whole history.
export function parseRecentParams(searchParams: URLSearchParams): {
  days: number;
  limit: number;
} {
  return {
    days: clampInt(searchParams.get("days"), RECENT_DEFAULT_DAYS, 1, RECENT_MAX_DAYS),
    limit: clampInt(searchParams.get("limit"), RECENT_DEFAULT_LIMIT, 1, RECENT_MAX_LIMIT),
  };
}

// Lower bound (inclusive, ms epoch) for a recent window of `days`: the
// start of the day `days - 1` calendar days ago, in the app timezone. So
// days=1 means "today only", days=14 means today + the prior 13 days.
export function recentSinceMs(
  days: number,
  tz: string = APP_TZ,
  nowTs: number = Date.now()
): number {
  const today = todayYmd(tz, nowTs);
  const firstDay = addDaysYmd(today, -(days - 1));
  return tzDayStart(firstDay, tz);
}

// ---- recents dedup (the capture-sheet "things you ate before" row) ----

type RecentMealLike = {
  id: string;
  caption?: string | null;
  meal_vibe?: string | null;
  items_json?: string | null;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Identity of a meal for dedup — the same food re-logged collapses to one
// recents entry. Key off the user caption (legacy "repeat of " prefixes
// peeled so an original and its repeats match), then the AI vibe, then the
// item-name set. Unknown/empty meals fall back to their id so they never
// merge with something else.
export function mealIdentityKey(meal: RecentMealLike): string {
  const cap = stripRepeatPrefix(meal.caption);
  if (cap) return "cap:" + norm(cap);
  const vibe = (meal.meal_vibe ?? "").trim();
  if (vibe) return "vibe:" + norm(vibe);
  try {
    const items = JSON.parse(meal.items_json ?? "[]");
    if (Array.isArray(items) && items.length) {
      const names = items
        .map((i) => norm(String((i as { name?: unknown })?.name ?? "")))
        .filter(Boolean)
        .sort();
      if (names.length) return "items:" + names.join("|");
    }
  } catch {
    // malformed items_json → fall through to the id fallback
  }
  return "id:" + meal.id;
}

// Collapse a NEWEST-FIRST list to one entry per food identity (keeping the
// most-recent occurrence), then cap to `limit`. The caller fetches a wider
// slice than `limit` so the dedup has candidates to fill from.
export function dedupeRecentMeals<T extends RecentMealLike>(meals: T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of meals) {
    const k = mealIdentityKey(m);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}
