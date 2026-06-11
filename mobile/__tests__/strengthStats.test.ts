// Stat-strip derivation tests — phone-local month bucketing (including the
// month- and year-boundary cases), beats summing, last-session selection.

import { strengthStats } from "../lib/strengthStats";
import type { SessionSummary } from "../lib/strengthTypes";

// A minimal SessionSummary builder — only the fields the strip reads.
function session(id: string, completed_at: number, beats_count: number): SessionSummary {
  return {
    id,
    started_at: completed_at - 60 * 60 * 1000,
    completed_at,
    note: null,
    exercise_ids: ["leg-press"],
    beats_count,
  };
}

// Local-time epoch for a given Y/M/D H:M (month is 1-based here for clarity).
function localMs(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

describe("strengthStats", () => {
  it("returns zeros + null for an empty session list", () => {
    const s = strengthStats([], localMs(2026, 6, 11));
    expect(s).toEqual({ sessionsThisMonth: 0, beatsThisMonth: 0, lastSessionAt: null });
  });

  it("counts only sessions in the same local calendar month as now", () => {
    const now = localMs(2026, 6, 11);
    const sessions = [
      session("jun-1", localMs(2026, 6, 2), 1),
      session("jun-2", localMs(2026, 6, 10), 3),
      session("may", localMs(2026, 5, 30), 5), // previous month — excluded
      session("jul", localMs(2026, 7, 1), 2), // next month — excluded
    ];
    const s = strengthStats(sessions, now);
    expect(s.sessionsThisMonth).toBe(2);
    expect(s.beatsThisMonth).toBe(1 + 3);
  });

  it("sums beats only across the in-month sessions", () => {
    const now = localMs(2026, 6, 15);
    const sessions = [
      session("a", localMs(2026, 6, 1), 0),
      session("b", localMs(2026, 6, 7), 2),
      session("c", localMs(2026, 6, 14), 4),
      session("d", localMs(2026, 4, 14), 99), // April — must not leak in
    ];
    expect(strengthStats(sessions, now).beatsThisMonth).toBe(6);
  });

  it("treats the same month NUMBER in a different YEAR as a different month", () => {
    const now = localMs(2027, 1, 5); // Jan 2027
    const sessions = [
      session("jan-2026", localMs(2026, 1, 20), 5), // Jan 2026 — different year
      session("jan-2027", localMs(2027, 1, 3), 2),
    ];
    const s = strengthStats(sessions, now);
    expect(s.sessionsThisMonth).toBe(1);
    expect(s.beatsThisMonth).toBe(2);
  });

  it("buckets a late-night last-of-month session in its LOCAL month", () => {
    // 23:30 on 31 May local. Whatever UTC says, the user trained in May.
    const lastOfMay = localMs(2026, 5, 31, 23, 30);
    const inMay = strengthStats([session("x", lastOfMay, 1)], localMs(2026, 5, 15));
    expect(inMay.sessionsThisMonth).toBe(1);
    // Now it's June: that same session must NOT count toward June.
    const inJune = strengthStats([session("x", lastOfMay, 1)], localMs(2026, 6, 1, 0, 30));
    expect(inJune.sessionsThisMonth).toBe(0);
  });

  it("counts a first-of-month early session in the new month", () => {
    const firstOfJune = localMs(2026, 6, 1, 0, 15);
    const s = strengthStats([session("y", firstOfJune, 2)], localMs(2026, 6, 11));
    expect(s.sessionsThisMonth).toBe(1);
    expect(s.beatsThisMonth).toBe(2);
  });

  it("picks the most recent completed_at as lastSessionAt regardless of order", () => {
    const a = localMs(2026, 6, 2);
    const b = localMs(2026, 6, 10); // newest
    const c = localMs(2026, 5, 20);
    // Deliberately unsorted.
    const s = strengthStats([session("a", a, 0), session("c", c, 0), session("b", b, 0)], localMs(2026, 6, 11));
    expect(s.lastSessionAt).toBe(b);
  });
});
