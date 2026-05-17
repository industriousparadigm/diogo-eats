import { describe, it, expect } from "vitest";
import {
  buildTrainingSummary,
  trainingPromptBlock,
  trainingHeadlineSuffix,
  strainTier,
  recoveryTier,
  type CycleRow,
  type WorkoutRow,
} from "../whoopContext";

const TODAY = "2026-05-17";
const YESTERDAY = "2026-05-16";

function cycle(day: string, over: Partial<CycleRow> = {}): CycleRow {
  return {
    day,
    strain: null,
    recovery_pct: null,
    hrv_ms: null,
    rhr_bpm: null,
    kcal: null,
    ...over,
  };
}

function workout(over: Partial<WorkoutRow> = {}): WorkoutRow {
  return {
    started_at: 1779011370000,
    ended_at: 1779016409000, // ~84 min later
    sport_name: "running",
    strain: 14,
    kcal: 600,
    ...over,
  };
}

describe("strainTier", () => {
  it("collapses 0-9 to rest", () => {
    expect(strainTier(0)).toBe("rest");
    expect(strainTier(9.9)).toBe("rest");
  });
  it("10-13.9 is moderate", () => {
    expect(strainTier(10)).toBe("moderate");
    expect(strainTier(13.9)).toBe("moderate");
  });
  it("14-17.9 is high", () => {
    expect(strainTier(14)).toBe("high");
    expect(strainTier(17.9)).toBe("high");
  });
  it("18+ is very_high", () => {
    expect(strainTier(18)).toBe("very_high");
    expect(strainTier(20.5)).toBe("very_high");
  });
  it("returns null for null", () => {
    expect(strainTier(null)).toBe(null);
  });
});

describe("recoveryTier", () => {
  it("buckets to low/amber/green", () => {
    expect(recoveryTier(20)).toBe("low");
    expect(recoveryTier(50)).toBe("amber");
    expect(recoveryTier(80)).toBe("green");
  });
  it("boundary 34 is amber", () => {
    expect(recoveryTier(34)).toBe("amber");
    expect(recoveryTier(33)).toBe("low");
  });
  it("boundary 67 is green", () => {
    expect(recoveryTier(67)).toBe("green");
    expect(recoveryTier(66)).toBe("amber");
  });
});

describe("buildTrainingSummary", () => {
  it("returns hasData=false when no cycles", () => {
    expect(buildTrainingSummary(TODAY, YESTERDAY, [], []).hasData).toBe(false);
  });

  it("flattens today's cycle into the summary", () => {
    const cs = [cycle(TODAY, { strain: 13.5, recovery_pct: 81, kcal: 2181 })];
    const s = buildTrainingSummary(TODAY, YESTERDAY, cs, []);
    expect(s.hasData).toBe(true);
    expect(s.today?.strain).toBe(13.5);
    expect(s.today?.strainTier).toBe("moderate");
    expect(s.today?.recoveryTier).toBe("green");
    expect(s.today?.kcalBurn).toBe(2181);
  });

  it("includes yesterday's strain when available", () => {
    const cs = [cycle(YESTERDAY, { strain: 17.9 })];
    const s = buildTrainingSummary(TODAY, YESTERDAY, cs, []);
    expect(s.yesterday?.strain).toBe(17.9);
    expect(s.yesterday?.strainTier).toBe("high");
  });

  it("rolls workouts into today.workouts with minutes computed", () => {
    const cs = [cycle(TODAY, { strain: 14 })];
    const w = workout({
      sport_name: "paddle-tennis",
      started_at: 1779011370000,
      ended_at: 1779011370000 + 84 * 60_000,
      strain: 13.2,
      kcal: 740,
    });
    const s = buildTrainingSummary(TODAY, YESTERDAY, cs, [w]);
    expect(s.today?.workouts).toEqual([
      { sport: "paddle tennis", strain: 13.2, minutes: 84, kcal: 740 },
    ]);
  });
});

describe("trainingPromptBlock", () => {
  it("returns empty string when no data", () => {
    expect(trainingPromptBlock({ hasData: false })).toBe("");
  });

  it("renders today's strain + recovery in human terms", () => {
    const s = buildTrainingSummary(
      TODAY,
      YESTERDAY,
      [cycle(TODAY, { strain: 13.5, recovery_pct: 81, kcal: 2181 })],
      []
    );
    const block = trainingPromptBlock(s);
    expect(block).toContain("strain 13.5");
    expect(block).toContain("moderate");
    expect(block).toContain("recovery 81%");
    expect(block).toContain("green");
    expect(block).toContain("2181 kcal");
  });

  it("includes workouts line when present", () => {
    const s = buildTrainingSummary(
      TODAY,
      YESTERDAY,
      [cycle(TODAY, { strain: 13.5 })],
      [
        workout({
          sport_name: "paddle-tennis",
          started_at: 0,
          ended_at: 84 * 60_000,
          strain: 13.2,
          kcal: 740,
        }),
      ]
    );
    const block = trainingPromptBlock(s);
    expect(block).toContain("paddle tennis");
    expect(block).toContain("84min");
    expect(block).toContain("strain 13.2");
  });

  it("includes the silence-is-fine instruction so the model doesn't shoehorn", () => {
    const s = buildTrainingSummary(TODAY, YESTERDAY, [cycle(TODAY, { strain: 5 })], []);
    expect(trainingPromptBlock(s).toLowerCase()).toContain("silence is fine");
  });
});

describe("trainingHeadlineSuffix", () => {
  it("returns null with no data", () => {
    expect(trainingHeadlineSuffix({ hasData: false })).toBeNull();
  });

  it("prioritises very_high strain over recovery", () => {
    const s = buildTrainingSummary(
      TODAY,
      YESTERDAY,
      [cycle(TODAY, { strain: 19, recovery_pct: 80 })],
      [workout({ sport_name: "trail run" })]
    );
    expect(trainingHeadlineSuffix(s)).toContain("very-high-strain");
    expect(trainingHeadlineSuffix(s)).toContain("trail run");
  });

  it("low recovery beats high strain when both present", () => {
    const s = buildTrainingSummary(
      TODAY,
      YESTERDAY,
      [cycle(TODAY, { strain: 16, recovery_pct: 20 })],
      []
    );
    expect(trainingHeadlineSuffix(s)).toContain("low recovery");
  });

  it("returns null on a quiet rest day with amber recovery", () => {
    const s = buildTrainingSummary(
      TODAY,
      YESTERDAY,
      [cycle(TODAY, { strain: 4, recovery_pct: 50 })],
      []
    );
    expect(trainingHeadlineSuffix(s)).toBeNull();
  });

  it("calls out a well-recovered rest day positively", () => {
    const s = buildTrainingSummary(
      TODAY,
      YESTERDAY,
      [cycle(TODAY, { strain: 4, recovery_pct: 80 })],
      []
    );
    expect(trainingHeadlineSuffix(s)).toContain("well-recovered rest");
  });
});
