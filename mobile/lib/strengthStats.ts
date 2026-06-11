// Strength dashboard stats — pure derivations for the landing's stat strip.
//
// The redesigned strength landing leads with a scoreboard glance, not a
// catalog: sessions this month, beats this month, last-session date. These
// derive client-side from the overview's session summaries (which already
// carry `beats_count` and `completed_at`); no new endpoint, no engine
// re-computation — just bucketing + summing for display.
//
// MONTH BUCKETING IS PHONE-LOCAL. `completed_at` is a ms epoch; we read its
// LOCAL calendar month (Date.getMonth/getFullYear), and "this month" is the
// local month of `now`. A session logged at 23:30 on the last of the month
// counts in that month even if it's already the 1st in UTC — the user thinks
// in their own clock, and the strip is display-only.

import type { SessionSummary } from "./strengthTypes";

export type StrengthStats = {
  sessionsThisMonth: number;
  beatsThisMonth: number;
  // ms epoch of the most recent session, or null if there are none.
  lastSessionAt: number | null;
};

// Two epochs fall in the same LOCAL calendar month iff their local year AND
// local month match. (Same month number across different years is NOT the
// same month — guards the year-boundary case, e.g. Jan 2026 vs Jan 2027.)
function sameLocalMonth(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth();
}

export function strengthStats(sessions: SessionSummary[], now: number): StrengthStats {
  let sessionsThisMonth = 0;
  let beatsThisMonth = 0;
  let lastSessionAt: number | null = null;

  for (const s of sessions) {
    if (sameLocalMonth(s.completed_at, now)) {
      sessionsThisMonth += 1;
      beatsThisMonth += s.beats_count;
    }
    if (lastSessionAt === null || s.completed_at > lastSessionAt) {
      lastSessionAt = s.completed_at;
    }
  }

  return { sessionsThisMonth, beatsThisMonth, lastSessionAt };
}
