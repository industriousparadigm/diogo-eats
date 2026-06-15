// Union timeline — merge/sort (sessions by completed_at, activities by
// started_at, newest first, stable tie-break) + active-days derivation
// (phone-local, sessions OR activities, de-duped per day) + last-moved.

import {
  mergeTimeline,
  movementsThisMonth,
  activeDaysThisMonth,
  lastMovedAt,
} from "../lib/movementTimeline";
import type { SessionSummary } from "../lib/strengthTypes";
import type { Activity } from "../lib/activityTypes";

function session(id: string, completed_at: number, beats = 0): SessionSummary {
  return {
    id,
    started_at: completed_at - 3_600_000,
    completed_at,
    note: null,
    exercise_ids: ["leg-press"],
    beats_count: beats,
  };
}

function activity(id: string, started_at: number, type = "padel"): Activity {
  return {
    id,
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
  };
}

function localMs(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

describe("mergeTimeline", () => {
  it("interleaves sessions and activities strictly newest-first", () => {
    const sessions = [
      session("s1", localMs(2026, 6, 10, 18)),
      session("s2", localMs(2026, 6, 5, 7)),
    ];
    const activities = [
      activity("a1", localMs(2026, 6, 11, 11)), // newest overall
      activity("a2", localMs(2026, 6, 7, 9)),
    ];
    const merged = mergeTimeline(sessions, activities);
    const order = merged.map((i) =>
      i.kind === "session" ? i.session.id : i.activity.id
    );
    expect(order).toEqual(["a1", "s1", "a2", "s2"]);
  });

  it("sorts a session by completed_at and an activity by started_at", () => {
    // An activity started_at AFTER a session's completed_at sorts above it.
    const sessions = [session("s", localMs(2026, 6, 10, 17))];
    const activities = [activity("a", localMs(2026, 6, 10, 18))];
    const merged = mergeTimeline(sessions, activities);
    expect(merged[0].kind).toBe("activity");
    expect(merged[1].kind).toBe("session");
  });

  it("is stable + deterministic on an exact timestamp tie", () => {
    const t = localMs(2026, 6, 10, 12);
    const a = mergeTimeline([session("s", t)], [activity("a", t)]);
    const b = mergeTimeline([session("s", t)], [activity("a", t)]);
    const ord = (m: ReturnType<typeof mergeTimeline>) =>
      m.map((i) => (i.kind === "session" ? i.session.id : i.activity.id));
    expect(ord(a)).toEqual(ord(b)); // same order both runs
  });

  it("handles empty inputs", () => {
    expect(mergeTimeline([], [])).toEqual([]);
    expect(mergeTimeline([session("s", 1)], [])).toHaveLength(1);
    expect(mergeTimeline([], [activity("a", 1)])).toHaveLength(1);
  });

  it("tags each item with the right kind + merge timestamp", () => {
    const s = session("s", localMs(2026, 6, 10, 18));
    const a = activity("a", localMs(2026, 6, 9, 11));
    const merged = mergeTimeline([s], [a]);
    expect(merged[0]).toMatchObject({ kind: "session", at: s.completed_at });
    expect(merged[1]).toMatchObject({ kind: "activity", at: a.started_at });
  });
});

describe("movementsThisMonth", () => {
  const now = localMs(2026, 6, 15);

  it("counts every session and activity in the local month", () => {
    const sessions = [
      session("s1", localMs(2026, 6, 10, 18)),
      session("s2", localMs(2026, 6, 5, 7)),
    ];
    const activities = [activity("a", localMs(2026, 6, 12, 11))];
    expect(movementsThisMonth(sessions, activities, now)).toBe(3);
  });

  it("does NOT de-dupe per day (two movements on one day count twice)", () => {
    const sessions = [session("s", localMs(2026, 6, 10, 18))];
    const activities = [activity("a", localMs(2026, 6, 10, 8))];
    // Same day, but two distinct movements — unlike active days, this is 2.
    expect(movementsThisMonth(sessions, activities, now)).toBe(2);
    expect(activeDaysThisMonth(sessions, activities, now)).toBe(1);
  });

  it("excludes movements outside the current local month", () => {
    const sessions = [session("s", localMs(2026, 5, 30, 18))]; // May
    const activities = [activity("a", localMs(2026, 7, 1, 11))]; // July
    expect(movementsThisMonth(sessions, activities, now)).toBe(0);
  });

  it("buckets a late-night last-of-month movement in its local month", () => {
    const lastOfMay = localMs(2026, 5, 31, 23, 30);
    expect(movementsThisMonth([], [activity("x", lastOfMay)], localMs(2026, 5, 15))).toBe(1);
    expect(movementsThisMonth([], [activity("x", lastOfMay)], localMs(2026, 6, 1))).toBe(0);
  });

  it("is zero for an empty month", () => {
    expect(movementsThisMonth([], [], now)).toBe(0);
  });
});

describe("activeDaysThisMonth", () => {
  const now = localMs(2026, 6, 15);

  it("counts a day with a session and a day with an activity as two days", () => {
    const sessions = [session("s", localMs(2026, 6, 10, 18))];
    const activities = [activity("a", localMs(2026, 6, 12, 11))];
    expect(activeDaysThisMonth(sessions, activities, now)).toBe(2);
  });

  it("de-dupes a day that has BOTH a session and an activity", () => {
    const day = localMs(2026, 6, 10, 8);
    const sessions = [session("s", localMs(2026, 6, 10, 18))];
    const activities = [activity("a", day)];
    expect(activeDaysThisMonth(sessions, activities, now)).toBe(1);
  });

  it("counts multiple activities on the same day once", () => {
    const sessions: SessionSummary[] = [];
    const activities = [
      activity("a1", localMs(2026, 6, 8, 9)),
      activity("a2", localMs(2026, 6, 8, 18)),
    ];
    expect(activeDaysThisMonth(sessions, activities, now)).toBe(1);
  });

  it("excludes days outside the current local month", () => {
    const sessions = [session("s", localMs(2026, 5, 30, 18))]; // May
    const activities = [activity("a", localMs(2026, 7, 1, 11))]; // July
    expect(activeDaysThisMonth(sessions, activities, now)).toBe(0);
  });

  it("buckets a late-night last-of-month activity in its local month", () => {
    const lastOfMay = localMs(2026, 5, 31, 23, 30);
    expect(
      activeDaysThisMonth([], [activity("x", lastOfMay)], localMs(2026, 5, 15))
    ).toBe(1);
    // In June it must not leak in.
    expect(
      activeDaysThisMonth([], [activity("x", lastOfMay)], localMs(2026, 6, 1))
    ).toBe(0);
  });

  it("is zero for an empty month", () => {
    expect(activeDaysThisMonth([], [], now)).toBe(0);
  });
});

describe("lastMovedAt", () => {
  it("returns the most recent across both sources", () => {
    const sessions = [session("s", localMs(2026, 6, 10, 18))];
    const activities = [activity("a", localMs(2026, 6, 11, 11))];
    expect(lastMovedAt(sessions, activities)).toBe(localMs(2026, 6, 11, 11));
  });

  it("prefers a newer session over an older activity", () => {
    const sessions = [session("s", localMs(2026, 6, 12, 7))];
    const activities = [activity("a", localMs(2026, 6, 9, 11))];
    expect(lastMovedAt(sessions, activities)).toBe(localMs(2026, 6, 12, 7));
  });

  it("returns null when nothing has been logged", () => {
    expect(lastMovedAt([], [])).toBeNull();
  });
});
