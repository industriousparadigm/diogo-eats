// Movement overview derivation — rhythm (per-day active cells) + per-type
// rollups (count, avg strain, avg duration, gym beats, recency). Phone-local
// bucketing, rolling window. The flat-timeline antidote.

import {
  buildRhythm,
  activeDayCount,
  buildRollups,
  windowStart,
  fmtRecency,
} from "../lib/movementRollup";
import type { SessionSummary } from "../lib/strengthTypes";
import type { Activity } from "../lib/activityTypes";

function session(id: string, completed_at: number, beats = 0): SessionSummary {
  return {
    id,
    started_at: completed_at - 3_600_000, // 60 min before
    completed_at,
    note: null,
    exercise_ids: ["leg-press"],
    beats_count: beats,
  };
}

function activity(
  id: string,
  started_at: number,
  type = "padel",
  strain: number | null = null,
  duration_min = 60
): Activity {
  return {
    id,
    type,
    label: null,
    started_at,
    duration_min,
    effort: null,
    distance_km: null,
    strain,
    note: null,
    source: strain == null ? "manual" : "whoop",
    external_id: null,
    created_at: started_at,
  };
}

function localMs(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

describe("windowStart", () => {
  it("is the start of the local day (days-1) days ago", () => {
    const now = localMs(2026, 6, 15, 9, 30);
    // 28-day window: lower edge = start of 19 May (15 Jun is day 28).
    expect(windowStart(now, 28)).toBe(localMs(2026, 5, 19, 0, 0));
  });
  it("a 1-day window is just today", () => {
    const now = localMs(2026, 6, 15, 23, 0);
    expect(windowStart(now, 1)).toBe(localMs(2026, 6, 15, 0, 0));
  });
});

describe("buildRhythm", () => {
  const now = localMs(2026, 6, 15, 9, 0);

  it("returns one cell per day, oldest→newest, last is today", () => {
    const r = buildRhythm([], [], now, 28);
    expect(r).toHaveLength(28);
    expect(r[27].today).toBe(true);
    expect(r[0].today).toBe(false);
  });

  it("marks a day active when a session OR activity falls on it", () => {
    const sessions = [session("s", localMs(2026, 6, 14, 18))]; // yesterday
    const activities = [activity("a", localMs(2026, 6, 15, 8))]; // today
    const r = buildRhythm(sessions, activities, now, 28);
    expect(r[27].active).toBe(true); // today
    expect(r[26].active).toBe(true); // yesterday
    expect(r[25].active).toBe(false);
  });

  it("de-dupes a day with both a session and an activity (still one active cell)", () => {
    const day = localMs(2026, 6, 12, 8);
    const r = buildRhythm(
      [session("s", localMs(2026, 6, 12, 19))],
      [activity("a", day)],
      now,
      28
    );
    expect(activeDayCount(r)).toBe(1);
  });

  it("ignores movements older than the window", () => {
    const old = localMs(2026, 5, 1, 12); // > 28 days before 15 Jun
    const r = buildRhythm([], [activity("a", old)], now, 28);
    expect(activeDayCount(r)).toBe(0);
  });

  it("counts a late-night activity on its local day", () => {
    const r = buildRhythm([], [activity("a", localMs(2026, 6, 14, 23, 45))], now, 28);
    expect(r[26].active).toBe(true); // 14 Jun cell
  });
});

describe("buildRollups", () => {
  const now = localMs(2026, 6, 15, 9, 0);

  it("collapses many same-type activities into ONE rollup with the count", () => {
    const padel = [
      activity("p1", localMs(2026, 6, 14, 10), "padel", 12),
      activity("p2", localMs(2026, 6, 12, 10), "padel", 13),
      activity("p3", localMs(2026, 6, 10, 10), "padel", 11),
    ];
    const rollups = buildRollups([], padel, now, 28);
    expect(rollups).toHaveLength(1);
    expect(rollups[0].type).toBe("padel");
    expect(rollups[0].count).toBe(3);
    expect(rollups[0].items).toHaveLength(3);
  });

  it("averages strain over items that have it (1 dp), null when none do", () => {
    const padel = [
      activity("p1", localMs(2026, 6, 14, 10), "padel", 12),
      activity("p2", localMs(2026, 6, 12, 10), "padel", 13),
    ];
    expect(buildRollups([], padel, now, 28)[0].avgStrain).toBe(12.5);

    const manual = [activity("m", localMs(2026, 6, 14, 10), "padel", null)];
    expect(buildRollups([], manual, now, 28)[0].avgStrain).toBeNull();
  });

  it("averages strain only over the items that carry it (mixed manual + whoop)", () => {
    const mixed = [
      activity("p1", localMs(2026, 6, 14, 10), "padel", 10),
      activity("p2", localMs(2026, 6, 12, 10), "padel", null), // manual, no strain
      activity("p3", localMs(2026, 6, 10, 10), "padel", 14),
    ];
    expect(buildRollups([], mixed, now, 28)[0].avgStrain).toBe(12); // (10+14)/2
  });

  it("gym rollup carries total beats + null strain; activities carry null beats", () => {
    const rollups = buildRollups(
      [session("s1", localMs(2026, 6, 14, 19), 3), session("s2", localMs(2026, 6, 11, 7), 2)],
      [activity("p", localMs(2026, 6, 13, 10), "padel", 12)],
      now,
      28
    );
    const gym = rollups.find((r) => r.type === "gym")!;
    const padel = rollups.find((r) => r.type === "padel")!;
    expect(gym.kind).toBe("gym");
    expect(gym.totalBeats).toBe(5);
    expect(gym.avgStrain).toBeNull();
    expect(padel.totalBeats).toBeNull();
  });

  it("computes gym avg duration from completed − started", () => {
    // session() spans 60 min.
    const rollups = buildRollups([session("s", localMs(2026, 6, 14, 19))], [], now, 28);
    expect(rollups[0].avgDurationMin).toBe(60);
  });

  it("sorts by count desc, then most-recent", () => {
    const acts = [
      activity("p1", localMs(2026, 6, 14, 10), "padel"),
      activity("p2", localMs(2026, 6, 12, 10), "padel"),
      activity("w1", localMs(2026, 6, 13, 8), "walk"),
    ];
    const order = buildRollups([], acts, now, 28).map((r) => r.type);
    expect(order).toEqual(["padel", "walk"]); // padel 2 > walk 1
  });

  it("excludes items outside the window", () => {
    const acts = [
      activity("in", localMs(2026, 6, 14, 10), "padel"),
      activity("out", localMs(2026, 4, 1, 10), "padel"), // way out
    ];
    expect(buildRollups([], acts, now, 28)[0].count).toBe(1);
  });

  it("lastAt is the most recent in-window moment", () => {
    const acts = [
      activity("p1", localMs(2026, 6, 14, 10), "padel"),
      activity("p2", localMs(2026, 6, 9, 10), "padel"),
    ];
    expect(buildRollups([], acts, now, 28)[0].lastAt).toBe(localMs(2026, 6, 14, 10));
  });

  it("is empty for no movement", () => {
    expect(buildRollups([], [], now, 28)).toEqual([]);
  });
});

describe("fmtRecency", () => {
  const now = localMs(2026, 6, 15, 9, 0);
  it("today / yesterday / Nd / Nw / Nmo", () => {
    expect(fmtRecency(localMs(2026, 6, 15, 7), now)).toBe("today");
    expect(fmtRecency(localMs(2026, 6, 14, 7), now)).toBe("yesterday");
    expect(fmtRecency(localMs(2026, 6, 12, 7), now)).toBe("3d ago");
    expect(fmtRecency(localMs(2026, 6, 5, 7), now)).toBe("1w ago");
    expect(fmtRecency(localMs(2026, 4, 20, 7), now)).toBe("2mo ago");
  });
});
