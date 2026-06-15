// Movement CONSISTENCY — "how often am I moving, and how hard?" in one read.
//
// Replaces the old square-grid rhythm (unreadable — no start/end, no
// intensity). The two things Diogo cares about: frequency (did I work out
// that day) and strength (how hard it was). So this derives, per day (or per
// week for long ranges, like the app's trend charts), whether a workout
// happened and its intensity, plus a single "worked out N of last X days".
//
// What counts as a "workout" (his rule, one binary — no "active vs moved"):
// any gym session or activity EXCEPT a walk under 60 min. Short walks still
// live in Recent + the Walk screen; they just don't count here.
//
// Intensity is a 0..1 score so the bars vary even when Whoop strain is absent
// (it often is): strain → min(strain/18, 1); else felt effort; else 0.5.
//
// Pure + phone-local bucketing, mirroring movementRollup / movementTimeline.

import type { Activity } from "./activityTypes";
import type { SessionSummary } from "./strengthTypes";
import { mergeTimeline, type TimelineItem } from "./movementTimeline";
import { windowStart } from "./movementRollup";

const DAY_MS = 24 * 60 * 60 * 1000;
// Day-vs-week display cutover: a month or less shows day bars, longer rolls up
// to weekly bars (so a 1y view isn't 365 hairlines).
export const CONSISTENCY_DAY_MAX = 31;

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// A logged activity "counts" as movement everywhere in the Movement tab — the
// one exclusion is a walk under 60 min (incidental, not a workout Diogo tracks).
// This is the single rule the landing (consistency + recent + by-activity) and
// the per-type screens all filter by, so a short walk never surfaces.
export function countsAsMovement(a: Activity): boolean {
  return !(a.type === "walk" && a.duration_min < 60);
}

// The TimelineItem form: every gym session counts; an activity counts unless
// it's a sub-60 walk.
export function isWorkout(item: TimelineItem): boolean {
  return item.kind === "session" ? true : countsAsMovement(item.activity);
}

// The type slug a timeline item belongs to ("gym" for a strength session).
export function itemType(item: TimelineItem): string {
  return item.kind === "session" ? "gym" : item.activity.type;
}

// The N most-frequent workout types over the items, most-used first. Ties
// break toward the more recently done type (deterministic). Powers the bar
// colouring + the legend: the top N get their own colour, the rest are "other".
export function topTypes(items: TimelineItem[], n = 3): string[] {
  const stat = new Map<string, { count: number; lastAt: number }>();
  for (const it of items) {
    const t = itemType(it);
    const s = stat.get(t);
    if (s) {
      s.count += 1;
      s.lastAt = Math.max(s.lastAt, it.at);
    } else {
      stat.set(t, { count: 1, lastAt: it.at });
    }
  }
  return [...stat.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].lastAt - a[1].lastAt)
    .slice(0, n)
    .map(([t]) => t);
}

// 0..1 intensity. Strain (0-21 Whoop scale) maps via /18 so a hard session
// (~13-18) lands near the top; below that, felt effort; else a neutral
// "counted" 0.5 (strain is OFTEN absent — the fallback is first-class).
export function intensityScore(item: TimelineItem): number {
  if (item.kind === "session") return 0.5;
  const a = item.activity;
  if (a.strain != null) return Math.min(a.strain / 18, 1);
  if (a.effort === "hard") return 1;
  if (a.effort === "moderate") return 0.7;
  if (a.effort === "light") return 0.4;
  return 0.5;
}

export type ConsistencyBucket = {
  label: string; // short date of the bucket's (start) day, for ticks
  worked: boolean; // a qualifying workout fell in this bucket
  intensity: number; // max intensity in the bucket (0 when no workout)
  type: string | null; // the dominant (max-intensity) workout's type, null = rest
  count: number; // how many qualifying workouts fell in the bucket
  atMs: number; // start-of-day ms of the bucket, for tooltip date formatting
};

export type Consistency = {
  buckets: ConsistencyBucket[]; // oldest -> newest, last bucket includes today
  workoutDays: number; // distinct local days with a workout, over the window
  mode: "day" | "week";
  topTypes: string[]; // most-used types (desc), for bar colour + legend
};

// Derive the consistency view over the last `periodDays`. Day buckets for
// short ranges, 7-day buckets (today-anchored) for long ones. Sub-60 walks
// are excluded throughout.
export function buildConsistency(
  sessions: SessionSummary[],
  activities: Activity[],
  now: number,
  periodDays: number
): Consistency {
  const from = windowStart(now, periodDays);
  const items = mergeTimeline(sessions, activities).filter(
    (it) => it.at >= from && isWorkout(it)
  );

  const workoutDays = new Set(items.map((it) => localDayKey(it.at))).size;
  const tops = topTypes(items, 3);
  const todayStart = startOfLocalDay(now);
  const mode: "day" | "week" = periodDays <= CONSISTENCY_DAY_MAX ? "day" : "week";
  const buckets: ConsistencyBucket[] = [];

  // The bucket's colour follows its DOMINANT (max-intensity) workout — same
  // item the height comes from, so height + colour read off one movement.
  type Peak = { intensity: number; type: string };
  const peakOf = (bucketItems: TimelineItem[]): Peak | null => {
    let peak: Peak | null = null;
    for (const it of bucketItems) {
      const s = intensityScore(it);
      if (!peak || s > peak.intensity) peak = { intensity: s, type: itemType(it) };
    }
    return peak;
  };

  if (mode === "day") {
    const byDay = new Map<string, TimelineItem[]>();
    for (const it of items) {
      const k = localDayKey(it.at);
      (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(it);
    }
    for (let i = periodDays - 1; i >= 0; i--) {
      const dayMs = todayStart - i * DAY_MS;
      const dayItems = byDay.get(localDayKey(dayMs)) ?? [];
      const peak = peakOf(dayItems);
      buckets.push({
        label: shortDate(dayMs),
        worked: peak != null,
        intensity: peak?.intensity ?? 0,
        type: peak?.type ?? null,
        count: dayItems.length,
        atMs: dayMs,
      });
    }
  } else {
    // 7-day buckets, the last ending today (oldest -> newest).
    const weeks = Math.ceil(periodDays / 7);
    for (let w = weeks - 1; w >= 0; w--) {
      const endDay = todayStart - w * 7 * DAY_MS;
      const startDay = endDay - 6 * DAY_MS;
      const inWeek = items.filter((it) => {
        const d = startOfLocalDay(it.at);
        return d >= startDay && d <= endDay;
      });
      const peak = peakOf(inWeek);
      buckets.push({
        label: shortDate(startDay),
        worked: peak != null,
        intensity: peak?.intensity ?? 0,
        type: peak?.type ?? null,
        count: inWeek.length,
        atMs: startDay,
      });
    }
  }

  return { buckets, workoutDays, mode, topTypes: tops };
}
