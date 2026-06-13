// Movement OVERVIEW derivation — the antidote to the endless flat timeline.
//
// Two glances answer the two questions a flat list buried:
//   1. "Am I moving, or slacking?"  → buildRhythm: one cell per local day for
//      the last N days, active when any movement happened. A streak/gap view.
//   2. "Which activities, how often?" → buildRollups: ONE summary per type
//      (padel, gym, walk…) — count + the headline metric (Whoop STRAIN when
//      present, else avg duration; gym shows beats) + recency — instead of a
//      dozen identical "Padel · 112m" cards. Each rollup keeps its in-window
//      items so the card can expand to the detail on demand.
//
// Pure + tested. Bucketing is PHONE-LOCAL (a 23:30 padel counts that day in
// the user's own clock), matching movementTimeline + strengthStats. The merge
// moment per item is the same rule the timeline uses: a session at its
// completed_at, an activity at its started_at.

import type { Activity } from "./activityTypes";
import type { SessionSummary } from "./strengthTypes";
import { mergeTimeline, type TimelineItem } from "./movementTimeline";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// The inclusive lower edge (ms) of a rolling window of `days` whole local days
// ending today: today plus the (days - 1) days before it.
export function windowStart(now: number, days: number): number {
  return startOfLocalDay(now) - (days - 1) * DAY_MS;
}

// ---- rhythm: "am I moving?" ------------------------------------------------

export type RhythmDay = { key: string; active: boolean; today: boolean };

// One cell per local day for the last `days` days, OLDEST→NEWEST (so it reads
// left-to-right like a calendar). `active` = at least one session or activity
// bucketed to that day. `today` flags the last cell for a subtle marker.
export function buildRhythm(
  sessions: SessionSummary[],
  activities: Activity[],
  now: number,
  days: number
): RhythmDay[] {
  const activeKeys = new Set<string>();
  const from = windowStart(now, days);
  for (const s of sessions) {
    if (s.completed_at >= from) activeKeys.add(localDayKey(s.completed_at));
  }
  for (const a of activities) {
    if (a.started_at >= from) activeKeys.add(localDayKey(a.started_at));
  }
  const todayStart = startOfLocalDay(now);
  const out: RhythmDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayMs = todayStart - i * DAY_MS;
    const key = localDayKey(dayMs);
    out.push({ key, active: activeKeys.has(key), today: i === 0 });
  }
  return out;
}

export function activeDayCount(rhythm: RhythmDay[]): number {
  return rhythm.reduce((n, d) => n + (d.active ? 1 : 0), 0);
}

// ---- rollups: "which activities, how often?" ------------------------------

export type MovementRollup = {
  type: string; // 'gym' | activity slug
  kind: "gym" | "activity";
  count: number;
  // Mean Whoop strain across this type's in-window items that HAVE strain, or
  // null when none do (manual rows, gym sessions). 1 dp.
  avgStrain: number | null;
  // Mean duration in whole minutes (activities: duration_min; gym: completed −
  // started). Always present — the fallback headline when there's no strain.
  avgDurationMin: number;
  // Gym only: total beats over the window (the scoreboard pulse). null for
  // activities.
  totalBeats: number | null;
  lastAt: number; // most recent in-window moment, ms epoch
  items: TimelineItem[]; // this type's in-window items, newest-first
};

function itemType(item: TimelineItem): string {
  return item.kind === "session" ? "gym" : item.activity.type;
}

function itemDurationMin(item: TimelineItem): number {
  if (item.kind === "activity") return item.activity.duration_min;
  return Math.max(0, Math.round((item.session.completed_at - item.session.started_at) / 60000));
}

// Group the in-window timeline by type into one rollup per type, sorted by
// count DESC (the activity you do most leads), ties broken by most-recent.
export function buildRollups(
  sessions: SessionSummary[],
  activities: Activity[],
  now: number,
  days: number
): MovementRollup[] {
  const from = windowStart(now, days);
  const inWindow = mergeTimeline(sessions, activities).filter((it) => it.at >= from);

  const byType = new Map<string, TimelineItem[]>();
  for (const it of inWindow) {
    const t = itemType(it);
    const arr = byType.get(t);
    if (arr) arr.push(it);
    else byType.set(t, [it]);
  }

  const rollups: MovementRollup[] = [];
  for (const [type, items] of byType) {
    const kind: "gym" | "activity" = type === "gym" ? "gym" : "activity";

    const strains: number[] = [];
    let durSum = 0;
    let beats = 0;
    for (const it of items) {
      durSum += itemDurationMin(it);
      if (it.kind === "session") beats += it.session.beats_count;
      else if (it.activity.strain != null) strains.push(it.activity.strain);
    }
    const avgStrain =
      strains.length > 0
        ? Math.round((strains.reduce((a, b) => a + b, 0) / strains.length) * 10) / 10
        : null;

    rollups.push({
      type,
      kind,
      count: items.length,
      avgStrain,
      avgDurationMin: Math.round(durSum / items.length),
      totalBeats: kind === "gym" ? beats : null,
      // items came from mergeTimeline (already newest-first); keep that order.
      lastAt: items[0].at,
      items,
    });
  }

  rollups.sort((a, b) => (b.count !== a.count ? b.count - a.count : b.lastAt - a.lastAt));
  return rollups;
}

// "today" / "yesterday" / "Nd ago" — the compact recency the rollup card shows
// for its most-recent item (no "ago" noise, gym-floor terse).
export function fmtRecency(lastAt: number, now: number): string {
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(lastAt)) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}
