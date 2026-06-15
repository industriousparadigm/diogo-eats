// Consistency derivation — what counts as a workout (sub-40 walks excluded),
// the 0..1 intensity score (strain -> effort -> neutral), and the day/week
// bucketing (rest gaps, intensity = max, oldest->newest, today last).

import {
  isWorkout,
  intensityScore,
  buildConsistency,
  itemType,
  topTypes,
  CONSISTENCY_DAY_MAX,
} from "../lib/movementConsistency";
import type { TimelineItem } from "../lib/movementTimeline";
import type { SessionSummary } from "../lib/strengthTypes";
import type { Activity } from "../lib/activityTypes";

function localMs(y: number, m: number, d: number, h = 12): number {
  return new Date(y, m - 1, d, h).getTime();
}

function activity(
  started_at: number,
  type = "padel",
  opts: Partial<Activity> = {}
): Activity {
  return {
    id: `a-${started_at}-${type}`,
    type,
    label: null,
    started_at,
    duration_min: 60,
    effort: null,
    distance_km: null,
    strain: null,
    surface: null,
    elevation_m: null,
    photo_filename: null,
    note: null,
    source: "manual",
    external_id: null,
    created_at: started_at,
    ...opts,
  };
}
function session(completed_at: number): SessionSummary {
  return {
    id: `s-${completed_at}`,
    started_at: completed_at - 3_600_000,
    completed_at,
    note: null,
    exercise_ids: ["leg-press"],
    beats_count: 0,
  };
}
const actItem = (a: Activity): TimelineItem => ({ kind: "activity", at: a.started_at, activity: a });
const sesItem = (s: SessionSummary): TimelineItem => ({ kind: "session", at: s.completed_at, session: s });

describe("isWorkout", () => {
  it("excludes a walk under 40 min", () => {
    expect(isWorkout(actItem(activity(1, "walk", { duration_min: 30 })))).toBe(false);
    expect(isWorkout(actItem(activity(1, "walk", { duration_min: 39 })))).toBe(false);
  });
  it("counts a walk of 40 min or more", () => {
    expect(isWorkout(actItem(activity(1, "walk", { duration_min: 40 })))).toBe(true);
    expect(isWorkout(actItem(activity(1, "walk", { duration_min: 75 })))).toBe(true);
  });
  it("counts runs, padel, and gym sessions regardless of duration", () => {
    expect(isWorkout(actItem(activity(1, "run", { duration_min: 20 })))).toBe(true);
    expect(isWorkout(actItem(activity(1, "padel", { duration_min: 30 })))).toBe(true);
    expect(isWorkout(sesItem(session(1)))).toBe(true);
  });
});

describe("intensityScore", () => {
  it("uses strain when present (min over /18)", () => {
    expect(intensityScore(actItem(activity(1, "run", { strain: 9 })))).toBeCloseTo(0.5);
    expect(intensityScore(actItem(activity(1, "run", { strain: 18 })))).toBe(1);
    expect(intensityScore(actItem(activity(1, "run", { strain: 21 })))).toBe(1); // clamped
  });
  it("falls back to felt effort when there is no strain", () => {
    expect(intensityScore(actItem(activity(1, "run", { effort: "light" })))).toBe(0.4);
    expect(intensityScore(actItem(activity(1, "run", { effort: "moderate" })))).toBe(0.7);
    expect(intensityScore(actItem(activity(1, "run", { effort: "hard" })))).toBe(1);
  });
  it("is a neutral 0.5 with neither strain nor effort, and for gym sessions", () => {
    expect(intensityScore(actItem(activity(1, "run")))).toBe(0.5);
    expect(intensityScore(sesItem(session(1)))).toBe(0.5);
  });
});

describe("buildConsistency", () => {
  const now = localMs(2026, 6, 15, 9);

  it("day mode for <= 31 days, one bucket per day, today last", () => {
    const c = buildConsistency([], [], now, 15);
    expect(c.mode).toBe("day");
    expect(c.buckets).toHaveLength(15);
    // last bucket = today
    expect(c.buckets[14].label).toBe("15/6");
  });

  it("week mode for long ranges", () => {
    const c = buildConsistency([], [], now, 90);
    expect(c.mode).toBe("week");
    expect(c.buckets).toHaveLength(Math.ceil(90 / 7));
  });

  it("marks worked days, leaves rest days a gap, and counts workout days", () => {
    const acts = [
      activity(localMs(2026, 6, 15, 8), "run"), // today
      activity(localMs(2026, 6, 13, 8), "padel"), // 2 days ago
    ];
    const c = buildConsistency([], acts, now, 15);
    expect(c.workoutDays).toBe(2);
    expect(c.buckets[14].worked).toBe(true); // today
    expect(c.buckets[13].worked).toBe(false); // yesterday = rest
    expect(c.buckets[12].worked).toBe(true); // 2 days ago
  });

  it("excludes sub-40 walks from the count and the chart", () => {
    const acts = [
      activity(localMs(2026, 6, 15, 8), "walk", { duration_min: 30 }), // short walk today
    ];
    const c = buildConsistency([], acts, now, 15);
    expect(c.workoutDays).toBe(0);
    expect(c.buckets[14].worked).toBe(false);
  });

  it("a 40-min walk counts", () => {
    const acts = [activity(localMs(2026, 6, 15, 8), "walk", { duration_min: 40 })];
    expect(buildConsistency([], acts, now, 15).workoutDays).toBe(1);
  });

  it("bucket intensity is the MAX of that day's workouts", () => {
    const acts = [
      activity(localMs(2026, 6, 15, 8), "run", { strain: 6 }), // 0.33
      activity(localMs(2026, 6, 15, 18), "padel", { strain: 18 }), // 1.0 same day
    ];
    const c = buildConsistency([], acts, now, 15);
    expect(c.buckets[14].intensity).toBe(1);
  });

  it("counts a gym session as a workout day", () => {
    const c = buildConsistency([session(localMs(2026, 6, 14, 19))], [], now, 15);
    expect(c.workoutDays).toBe(1);
    expect(c.buckets[13].worked).toBe(true);
  });

  it("ignores movement older than the window", () => {
    const acts = [activity(localMs(2026, 4, 1, 8), "run")]; // way out
    expect(buildConsistency([], acts, now, 15).workoutDays).toBe(0);
  });

  it("is empty-safe", () => {
    const c = buildConsistency([], [], now, 7);
    expect(c.workoutDays).toBe(0);
    expect(c.buckets.every((b) => !b.worked)).toBe(true);
  });

  it("the day/week cutover is CONSISTENCY_DAY_MAX", () => {
    expect(buildConsistency([], [], now, CONSISTENCY_DAY_MAX).mode).toBe("day");
    expect(buildConsistency([], [], now, CONSISTENCY_DAY_MAX + 1).mode).toBe("week");
  });
});

describe("itemType + topTypes", () => {
  it("maps a session to 'gym' and an activity to its type", () => {
    expect(itemType(sesItem(session(localMs(2026, 6, 15))))).toBe("gym");
    expect(itemType(actItem(activity(localMs(2026, 6, 15), "padel")))).toBe("padel");
  });

  it("ranks by frequency, ties broken by recency", () => {
    const items = [
      actItem(activity(localMs(2026, 6, 14), "padel")),
      actItem(activity(localMs(2026, 6, 13), "padel")),
      actItem(activity(localMs(2026, 6, 12), "run")),
      sesItem(session(localMs(2026, 6, 11))), // gym
      actItem(activity(localMs(2026, 6, 10), "walk", { duration_min: 90 })),
    ];
    expect(topTypes(items, 3)).toEqual(["padel", "run", "gym"]); // 2 > recency run>gym>walk
    expect(topTypes(items, 2)).toEqual(["padel", "run"]);
  });
});

describe("buildConsistency — type/count for colouring + tooltip", () => {
  const now = localMs(2026, 6, 15);

  it("bucket.type is the DOMINANT (max-intensity) workout that day", () => {
    // gym (0.5) + a hard-strain padel (0.78) on the same day → padel dominates.
    const c = buildConsistency(
      [session(localMs(2026, 6, 15, 18))],
      [activity(localMs(2026, 6, 15, 10), "padel", { strain: 14 })],
      now,
      15
    );
    const today = c.buckets[c.buckets.length - 1];
    expect(today.type).toBe("padel");
    expect(today.count).toBe(2);
  });

  it("rest buckets carry null type + 0 count; topTypes is returned", () => {
    const c = buildConsistency([], [activity(localMs(2026, 6, 14), "run")], now, 15);
    expect(c.topTypes).toContain("run");
    const rest = c.buckets.find((b) => !b.worked)!;
    expect(rest.type).toBeNull();
    expect(rest.count).toBe(0);
  });
});
