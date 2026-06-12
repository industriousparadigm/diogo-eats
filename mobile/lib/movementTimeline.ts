// Union timeline — the Movement tab's RECENT list interleaves two sources
// into one newest-first stream: gym SESSIONS (the strength scoreboard) and
// general ACTIVITIES (padel, runs, walks…). Pure derivation; the server
// never merges these — the client does it for display.
//
// The merge key is the moment the movement HAPPENED:
//   - a session sorts by `completed_at` (when the workout ended — the same
//     timestamp the strength landing already sorts by),
//   - an activity sorts by `started_at` (when it began; activities carry no
//     completed_at).
// Ties break by id so the order is stable (no flicker between renders).
//
// ACTIVE DAYS is the new movement stat: any day with at least one session OR
// one activity counts once. Bucketing is PHONE-LOCAL (a 23:30 padel on the
// last of the month counts that day in the user's own clock, whatever UTC
// says) — the same rule strengthStats uses for month bucketing.

import type { Activity } from "./activityTypes";
import type { SessionSummary } from "./strengthTypes";

// A discriminated union so the card renderer can switch cleanly. `at` is the
// merge/display timestamp (ms epoch) chosen per the rule above.
export type TimelineItem =
  | { kind: "session"; at: number; session: SessionSummary }
  | { kind: "activity"; at: number; activity: Activity };

// Merge sessions + activities newest-first. Stable tie-break by id.
export function mergeTimeline(
  sessions: SessionSummary[],
  activities: Activity[]
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...sessions.map(
      (s): TimelineItem => ({ kind: "session", at: s.completed_at, session: s })
    ),
    ...activities.map(
      (a): TimelineItem => ({ kind: "activity", at: a.started_at, activity: a })
    ),
  ];
  items.sort((x, y) => {
    if (y.at !== x.at) return y.at - x.at; // newest first
    const xid = x.kind === "session" ? x.session.id : x.activity.id;
    const yid = y.kind === "session" ? y.session.id : y.activity.id;
    return xid < yid ? 1 : xid > yid ? -1 : 0; // stable, deterministic
  });
  return items;
}

// The local YYYY-MM-DD a timestamp falls on, in the phone's own clock.
function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Two epochs in the same LOCAL calendar month (year AND month match — guards
// the same-month-different-year case, mirroring strengthStats).
function sameLocalMonth(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth();
}

// Active days THIS local month: count distinct local days (in `now`'s month)
// that had any session or any activity. A day with a gym session AND a padel
// counts once.
export function activeDaysThisMonth(
  sessions: SessionSummary[],
  activities: Activity[],
  now: number
): number {
  const days = new Set<string>();
  for (const s of sessions) {
    if (sameLocalMonth(s.completed_at, now)) days.add(localDayKey(s.completed_at));
  }
  for (const a of activities) {
    if (sameLocalMonth(a.started_at, now)) days.add(localDayKey(a.started_at));
  }
  return days.size;
}

// The most recent "moved" moment across both sources (ms epoch), or null if
// the user has neither sessions nor activities. Powers the "last moved" stat.
export function lastMovedAt(
  sessions: SessionSummary[],
  activities: Activity[]
): number | null {
  let max: number | null = null;
  for (const s of sessions) {
    if (max === null || s.completed_at > max) max = s.completed_at;
  }
  for (const a of activities) {
    if (max === null || a.started_at > max) max = a.started_at;
  }
  return max;
}
