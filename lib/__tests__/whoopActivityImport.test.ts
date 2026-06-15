import { describe, it, expect } from "vitest";
import {
  planWhoopImport,
  MIN_DURATION_MIN,
  MIN_UNDEFINED_MIN,
  type WhoopWorkoutRow,
  type StrengthSessionRow,
  type ActivityRow,
} from "../whoopActivityImport";

// Fixed epoch anchors (all Europe/Lisbon, summer = UTC+1). A workout that
// "starts at 10:00 Lisbon" on 2026-06-12 is 09:00 UTC.
const DAY = 24 * 3600 * 1000;
const MIN = 60 * 1000;
// 2026-06-12 09:00 UTC = 10:00 Lisbon.
const JUN12_10 = Date.UTC(2026, 5, 12, 9, 0);
const NOW = Date.UTC(2026, 5, 15, 11, 0); // 2026-06-15 12:00 Lisbon

// A workout `min` minutes long, default a 60-min recognised sport.
function workout(
  over: Partial<WhoopWorkoutRow> & { started_at: number; min: number }
): WhoopWorkoutRow {
  const { min, ...rest } = over;
  return {
    whoop_workout_id: rest.whoop_workout_id ?? `uuid-${rest.started_at}`,
    started_at: rest.started_at,
    ended_at: rest.started_at + min * MIN,
    sport_name: rest.sport_name ?? "paddle-tennis",
    // "strain" in rest preserves an explicit null; only a missing key defaults.
    strain: "strain" in rest ? (rest.strain as number | null) : 10,
    kcal: "kcal" in rest ? (rest.kcal as number | null) : 500,
  };
}

describe("planWhoopImport", () => {
  it("adds a brand-new recognised workout as a source='whoop' row", () => {
    const w = workout({ started_at: JUN12_10, min: 60, sport_name: "running", strain: 12.34 });
    const plan = planWhoopImport([w], [], [], NOW);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toEnrich).toHaveLength(0);
    expect(plan.dropped).toHaveLength(0);
    expect(plan.skippedGym).toHaveLength(0);

    const row = plan.toAdd[0];
    expect(row.type).toBe("run");
    expect(row.label).toBeNull();
    expect(row.source).toBe("whoop");
    expect(row.effort).toBeNull();
    expect(row.distance_km).toBeNull();
    expect(row.duration_min).toBe(60);
    expect(row.external_id).toBe(w.whoop_workout_id);
    expect(row.started_at).toBe(JUN12_10);
  });

  it("maps the sport names: paddle-tennis→padel, walking→walk, functional-fitness→other+label", () => {
    const ws = [
      workout({ started_at: JUN12_10, min: 60, sport_name: "paddle-tennis", whoop_workout_id: "a" }),
      workout({ started_at: JUN12_10 + 5 * DAY, min: 60, sport_name: "walking", whoop_workout_id: "b" }),
      workout({
        started_at: JUN12_10 + 10 * DAY,
        min: 60,
        sport_name: "functional-fitness",
        whoop_workout_id: "c",
      }),
    ];
    const plan = planWhoopImport(ws, [], [], NOW);
    const byId = Object.fromEntries(plan.toAdd.map((r) => [r.external_id, r]));
    expect(byId["a"].type).toBe("padel");
    expect(byId["a"].label).toBeNull();
    expect(byId["b"].type).toBe("walk");
    expect(byId["c"].type).toBe("other");
    expect(byId["c"].label).toBe("functional fitness");
  });

  it("skips a workout whose UUID is already linked in an existing activity (idempotent)", () => {
    const w = workout({ started_at: JUN12_10, min: 60, whoop_workout_id: "already-linked" });
    const existing: ActivityRow = {
      id: "act-1",
      type: "padel",
      started_at: JUN12_10,
      duration_min: 60,
      source: "whoop",
      external_id: "already-linked",
    };
    const plan = planWhoopImport([w], [], [existing], NOW);
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.toEnrich).toHaveLength(0);
    expect(plan.dropped).toHaveLength(0);
    expect(plan.skippedGym).toHaveLength(0);
  });

  it("drops a recognised workout under the 20-min floor", () => {
    const w = workout({ started_at: JUN12_10, min: MIN_DURATION_MIN - 1, sport_name: "walking" });
    const plan = planWhoopImport([w], [], [], NOW);
    expect(plan.dropped).toHaveLength(1);
    expect(plan.toAdd).toHaveLength(0);
  });

  it("keeps a recognised workout exactly at the 20-min floor", () => {
    const w = workout({ started_at: JUN12_10, min: MIN_DURATION_MIN, sport_name: "walking" });
    const plan = planWhoopImport([w], [], [], NOW);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.dropped).toHaveLength(0);
  });

  it("drops a generic unlabelled 'activity' of 25 min (below the 30-min floor)", () => {
    const w = workout({ started_at: JUN12_10, min: 25, sport_name: "activity" });
    const plan = planWhoopImport([w], [], [], NOW);
    expect(plan.dropped).toHaveLength(1);
    expect(plan.toAdd).toHaveLength(0);
  });

  it("adds a generic unlabelled 'activity' of 35 min (above the 30-min floor)", () => {
    const w = workout({ started_at: JUN12_10, min: 35, sport_name: "activity" });
    const plan = planWhoopImport([w], [], [], NOW);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0].type).toBe("other");
    expect(plan.toAdd[0].label).toBeNull();
    expect(plan.toAdd[0].duration_min).toBe(35);
  });

  it("uses MIN_UNDEFINED_MIN > MIN_DURATION_MIN (the floors differ as expected)", () => {
    expect(MIN_UNDEFINED_MIN).toBeGreaterThan(MIN_DURATION_MIN);
  });

  it("skips a workout overlapping a logged gym session (gym dupe)", () => {
    // Session 10:30–11:30; workout 11:00–12:00 overlaps the tail.
    const w = workout({
      started_at: JUN12_10 + 60 * MIN, // 11:00
      min: 60,
      sport_name: "functional-fitness",
    });
    const session: StrengthSessionRow = {
      started_at: JUN12_10 + 30 * MIN, // 10:30
      completed_at: JUN12_10 + 90 * MIN, // 11:30
    };
    const plan = planWhoopImport([w], [session], [], NOW);
    expect(plan.skippedGym).toHaveLength(1);
    expect(plan.toAdd).toHaveLength(0);
  });

  it("gym-overlap interval math: touching-edge windows do NOT overlap", () => {
    // Workout ends exactly when the session starts → no overlap (strict <,>).
    const w = workout({ started_at: JUN12_10, min: 30, sport_name: "walking" });
    const session: StrengthSessionRow = {
      started_at: JUN12_10 + 30 * MIN, // session starts at workout's end
      completed_at: JUN12_10 + 90 * MIN,
    };
    const plan = planWhoopImport([w], [session], [], NOW);
    expect(plan.skippedGym).toHaveLength(0);
    expect(plan.toAdd).toHaveLength(1);
  });

  it("gym-overlap interval math: a session fully inside the workout window overlaps", () => {
    const w = workout({ started_at: JUN12_10, min: 120, sport_name: "functional-fitness" });
    const session: StrengthSessionRow = {
      started_at: JUN12_10 + 30 * MIN,
      completed_at: JUN12_10 + 60 * MIN,
    };
    const plan = planWhoopImport([w], [session], [], NOW);
    expect(plan.skippedGym).toHaveLength(1);
  });

  it("enriches a same-day, same-type manual row (external_id null) and does NOT also add it", () => {
    const w = workout({
      started_at: JUN12_10 + 60 * MIN, // later in the same Lisbon day
      min: 75,
      sport_name: "paddle-tennis",
      strain: 11.27,
      kcal: 640,
      whoop_workout_id: "padel-uuid",
    });
    const manual: ActivityRow = {
      id: "manual-padel",
      type: "padel",
      started_at: JUN12_10, // same day, placeholder hour
      duration_min: 90, // his stated duration — must be untouched
      source: "manual",
      external_id: null,
    };
    const plan = planWhoopImport([w], [], [manual], NOW);
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.toEnrich).toHaveLength(1);
    const e = plan.toEnrich[0];
    expect(e.id).toBe("manual-padel");
    expect(e.external_id).toBe("padel-uuid");
    expect(e.strain).toBe(11.3); // rounded to 1dp
    expect(e.note).toBe("Whoop: strain 11.3, 640 kcal");
    // The enrich instruction carries ONLY id/external_id/strain/note —
    // never label/effort/duration/started_at.
    expect(Object.keys(e).sort()).toEqual(["external_id", "id", "note", "strain"]);
  });

  it("does not enrich across a day boundary (same type, different Lisbon day → add)", () => {
    const w = workout({ started_at: JUN12_10 + DAY, min: 60, sport_name: "paddle-tennis" });
    const manual: ActivityRow = {
      id: "manual-padel",
      type: "padel",
      started_at: JUN12_10, // previous day
      duration_min: 90,
      source: "manual",
      external_id: null,
    };
    const plan = planWhoopImport([w], [], [manual], NOW);
    expect(plan.toEnrich).toHaveLength(0);
    expect(plan.toAdd).toHaveLength(1);
  });

  it("does not enrich a manual row of a different type (run vs padel → add)", () => {
    const w = workout({ started_at: JUN12_10, min: 60, sport_name: "running" });
    const manual: ActivityRow = {
      id: "manual-padel",
      type: "padel",
      started_at: JUN12_10,
      duration_min: 90,
      source: "manual",
      external_id: null,
    };
    const plan = planWhoopImport([w], [], [manual], NOW);
    expect(plan.toEnrich).toHaveLength(0);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0].type).toBe("run");
  });

  it("does not enrich a manual row that already has an external_id", () => {
    const w = workout({ started_at: JUN12_10, min: 60, sport_name: "paddle-tennis" });
    const manual: ActivityRow = {
      id: "manual-padel",
      type: "padel",
      started_at: JUN12_10,
      duration_min: 90,
      source: "whoop",
      external_id: "some-other-uuid",
    };
    const plan = planWhoopImport([w], [], [manual], NOW);
    expect(plan.toEnrich).toHaveLength(0);
    expect(plan.toAdd).toHaveLength(1);
  });

  it("one manual row is enriched at most once; a second same-day same-type workout is added", () => {
    const w1 = workout({
      started_at: JUN12_10,
      min: 60,
      sport_name: "paddle-tennis",
      whoop_workout_id: "w1",
    });
    const w2 = workout({
      started_at: JUN12_10 + 120 * MIN,
      min: 60,
      sport_name: "paddle-tennis",
      whoop_workout_id: "w2",
    });
    const manual: ActivityRow = {
      id: "manual-padel",
      type: "padel",
      started_at: JUN12_10,
      duration_min: 90,
      source: "manual",
      external_id: null,
    };
    const plan = planWhoopImport([w1, w2], [], [manual], NOW);
    expect(plan.toEnrich).toHaveLength(1);
    expect(plan.toAdd).toHaveLength(1);
    // The earlier workout enriches (oldest-first pairing); the later is added.
    expect(plan.toEnrich[0].external_id).toBe("w1");
    expect(plan.toAdd[0].external_id).toBe("w2");
  });

  it("rounds strain to one decimal on added rows; null strain stays null", () => {
    const ws = [
      workout({ started_at: JUN12_10, min: 60, strain: 9.86, whoop_workout_id: "r1" }),
      workout({ started_at: JUN12_10 + 5 * DAY, min: 60, strain: null, whoop_workout_id: "r2" }),
    ];
    const plan = planWhoopImport(ws, [], [], NOW);
    const byId = Object.fromEntries(plan.toAdd.map((r) => [r.external_id, r]));
    expect(byId["r1"].strain).toBe(9.9);
    expect(byId["r2"].strain).toBeNull();
  });

  it("stamps the Whoop note with rounded strain + rounded kcal", () => {
    const w = workout({ started_at: JUN12_10, min: 60, strain: 14.05, kcal: 812.6 });
    const plan = planWhoopImport([w], [], [], NOW);
    expect(plan.toAdd[0].note).toBe("Whoop: strain 14.1, 813 kcal");
  });

  it("returns empty buckets for no workouts", () => {
    const plan = planWhoopImport([], [], [], NOW);
    expect(plan).toEqual({ toAdd: [], toEnrich: [], dropped: [], skippedGym: [] });
  });
});
