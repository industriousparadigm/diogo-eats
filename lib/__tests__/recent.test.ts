import { describe, it, expect } from "vitest";
import {
  parseRecentParams,
  recentSinceMs,
  RECENT_DEFAULT_DAYS,
  RECENT_DEFAULT_LIMIT,
  RECENT_MAX_DAYS,
  RECENT_MAX_LIMIT,
} from "../recent";
import { tzDayStart } from "../tz";

function params(qs: string): URLSearchParams {
  return new URL(`https://x/api/meals/recent${qs}`).searchParams;
}

describe("parseRecentParams", () => {
  it("defaults when params are absent", () => {
    expect(parseRecentParams(params(""))).toEqual({
      days: RECENT_DEFAULT_DAYS,
      limit: RECENT_DEFAULT_LIMIT,
    });
  });

  it("reads explicit values", () => {
    expect(parseRecentParams(params("?days=7&limit=20"))).toEqual({
      days: 7,
      limit: 20,
    });
  });

  it("clamps days to [1, max]", () => {
    expect(parseRecentParams(params("?days=0")).days).toBe(1);
    expect(parseRecentParams(params("?days=999")).days).toBe(RECENT_MAX_DAYS);
  });

  it("clamps limit to [1, max]", () => {
    expect(parseRecentParams(params("?limit=0")).limit).toBe(1);
    expect(parseRecentParams(params("?limit=9999")).limit).toBe(RECENT_MAX_LIMIT);
  });

  it("falls back to defaults on garbage", () => {
    const r = parseRecentParams(params("?days=abc&limit=xyz"));
    expect(r.days).toBe(RECENT_DEFAULT_DAYS);
    expect(r.limit).toBe(RECENT_DEFAULT_LIMIT);
  });
});

describe("recentSinceMs", () => {
  // Fixed clock: 2026-06-10 12:00 Lisbon (summer, UTC+1).
  const now = Date.UTC(2026, 5, 10, 11, 0);

  it("days=1 is the start of today in the app tz", () => {
    expect(recentSinceMs(1, undefined, now)).toBe(tzDayStart("2026-06-10"));
  });

  it("days=14 reaches back to the start of the 14th-most-recent day", () => {
    // today + 13 prior days → first day is 2026-05-28.
    expect(recentSinceMs(14, undefined, now)).toBe(tzDayStart("2026-05-28"));
  });

  it("the window lower bound precedes now", () => {
    expect(recentSinceMs(14, undefined, now)).toBeLessThan(now);
  });
});
