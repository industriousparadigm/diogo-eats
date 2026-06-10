import { getSupabase } from "./db";
import { todayYmd, tzDayBounds } from "./tz";

// Per-user daily Vision-parse quota. Each /api/parse or /api/parse-text
// call counts as one event. Defends against runaway loops, share-link
// leaks, and bored users mid-test from draining the Anthropic budget.
//
// 30/user/day = generous for ~6 meals × ~3 retries average. Lifted
// later if/when needed; for now it's a soft guardrail with a clear
// error message.

export const PARSE_QUOTA_PER_DAY = 30;
export const PARSE_EVENT_KIND = "parse";

export type QuotaState = {
  used: number;
  limit: number;
  ok: boolean; // true if the caller can proceed (used < limit)
  resetsAt: number; // ms epoch, next Lisbon midnight
};

// Day window in the app timezone — NOT server-local. On Vercel (UTC)
// the old setHours(0,0,0,0) reset the quota at 01:00 Lisbon in summer.
function todayBounds(): [number, number] {
  return tzDayBounds(todayYmd());
}

// Look up today's count of parse events for this user. Doesn't
// increment — callers must call recordParseEvent() on success.
export async function getParseQuota(userId: string): Promise<QuotaState> {
  const supa = getSupabase();
  const [dayStart, dayEnd] = todayBounds();
  const { count, error } = await supa
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", PARSE_EVENT_KIND)
    .gte("created_at", dayStart);
  if (error) {
    // Fail open — better to allow the parse than to block on a
    // counter glitch. We log and let it through.
    console.error("getParseQuota lookup failed:", error.message);
    return {
      used: 0,
      limit: PARSE_QUOTA_PER_DAY,
      ok: true,
      resetsAt: dayEnd,
    };
  }
  const used = count ?? 0;
  return {
    used,
    limit: PARSE_QUOTA_PER_DAY,
    ok: used < PARSE_QUOTA_PER_DAY,
    resetsAt: dayEnd,
  };
}

// Insert one event. Best-effort — failures don't break the parse,
// the user just gets a free request. Logged for visibility.
export async function recordParseEvent(userId: string): Promise<void> {
  const supa = getSupabase();
  const { error } = await supa.from("usage_events").insert({
    user_id: userId,
    kind: PARSE_EVENT_KIND,
    created_at: Date.now(),
  });
  if (error) {
    console.error("recordParseEvent failed:", error.message);
  }
}
