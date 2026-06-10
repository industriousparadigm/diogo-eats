import { tzDayStart, todayYmd, addDaysYmd, APP_TZ } from "./tz";

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
