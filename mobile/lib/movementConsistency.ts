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

// A workout is anything EXCEPT a walk shorter than 60 min.
export function isWorkout(item: TimelineItem): boolean {
  if (item.kind === "activity") {
    return !(item.activity.type === "walk" && item.activity.duration_min < 60);
  }
  return true; // every gym session counts
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
};

export type Consistency = {
  buckets: ConsistencyBucket[]; // oldest -> newest, last bucket includes today
  workoutDays: number; // distinct local days with a workout, over the window
  mode: "day" | "week";
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
  const todayStart = startOfLocalDay(now);
  const mode: "day" | "week" = periodDays <= CONSISTENCY_DAY_MAX ? "day" : "week";
  const buckets: ConsistencyBucket[] = [];

  if (mode === "day") {
    const byDay = new Map<string, number>(); // dayKey -> max intensity
    for (const it of items) {
      const k = localDayKey(it.at);
      byDay.set(k, Math.max(byDay.get(k) ?? 0, intensityScore(it)));
    }
    for (let i = periodDays - 1; i >= 0; i--) {
      const dayMs = todayStart - i * DAY_MS;
      const k = localDayKey(dayMs);
      buckets.push({ label: shortDate(dayMs), worked: byDay.has(k), intensity: byDay.get(k) ?? 0 });
    }
  } else {
    // 7-day buckets, the last ending today (oldest -> newest).
    const weeks = Math.ceil(periodDays / 7);
    for (let w = weeks - 1; w >= 0; w--) {
      const endDay = todayStart - w * 7 * DAY_MS;
      const startDay = endDay - 6 * DAY_MS;
      let worked = false;
      let intensity = 0;
      for (const it of items) {
        const d = startOfLocalDay(it.at);
        if (d >= startDay && d <= endDay) {
          worked = true;
          intensity = Math.max(intensity, intensityScore(it));
        }
      }
      buckets.push({ label: shortDate(startDay), worked, intensity });
    }
  }

  return { buckets, workoutDays, mode };
}
