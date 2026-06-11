import { describe, it, expect } from "vitest";
import { fmtKg, generateHighlights } from "../highlights";
import type { Exercise, StrengthSession } from "../types";

// ---- fixtures (mirror engine.test.ts) ----

const LEG: Exercise = {
  id: "leg-press",
  name: "Leg press",
  description: "",
  measurement_type: "weight_reps",
  image_key: "leg-press",
  created_by: null,
  sort_order: 1,
};
const BACK: Exercise = {
  id: "back-extension",
  name: "Back extension",
  description: "",
  measurement_type: "bodyweight_reps",
  image_key: "back-extension",
  created_by: null,
  sort_order: 2,
};
const CHEST: Exercise = {
  id: "chest-press",
  name: "Chest press",
  description: "",
  measurement_type: "weight_reps",
  image_key: "chest-press",
  created_by: null,
  sort_order: 3,
};
const ROW: Exercise = {
  id: "seated-row",
  name: "Seated row",
  description: "",
  measurement_type: "weight_reps",
  image_key: "seated-row",
  created_by: null,
  sort_order: 4,
};
const CARRY: Exercise = {
  id: "farmers-carry",
  name: "Farmer's carry",
  description: "",
  measurement_type: "carry",
  image_key: "farmers-carry",
  created_by: null,
  sort_order: 5,
};
const EXERCISES = [LEG, BACK, CHEST, ROW, CARRY];

function ts(ymd: string, hourUtc = 12): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hourUtc);
}

type SetSpec = [string, number, number | null, number];

function makeSession(
  id: string,
  ymd: string,
  setSpecs: SetSpec[],
  opts: { hourUtc?: number } = {}
): StrengthSession {
  const completed = ts(ymd, opts.hourUtc ?? 12);
  return {
    id,
    started_at: completed - 45 * 60 * 1000,
    completed_at: completed,
    note: null,
    sets: setSpecs.map(([exercise_id, series_index, weight_kg, reps]) => ({
      exercise_id,
      series_index,
      weight_kg,
      reps,
    })),
  };
}

function day1(id = "s1", ymd = "2026-06-10"): StrengthSession {
  return makeSession(id, ymd, [
    ["leg-press", 1, 32, 12],
    ["leg-press", 2, 39, 12],
    ["back-extension", 1, null, 12],
    ["back-extension", 2, null, 12],
    ["chest-press", 1, 32, 12],
    ["chest-press", 2, 32, 12],
    ["seated-row", 1, 25, 12],
    ["seated-row", 2, 32, 12],
    ["farmers-carry", 1, 16, 60],
    ["farmers-carry", 2, 16, 60],
  ]);
}

function byId(highlights: ReturnType<typeof generateHighlights>, id: string) {
  return highlights.find((h) => h.id === id);
}

// ---- beats line (always present, always first) ----

describe("beats line", () => {
  it("first-ever session gets the on-the-board frame, never 'consolidation'", () => {
    const h = generateHighlights(EXERCISES, [], day1());
    expect(h[0].id).toBe("beats");
    expect(h[0].line).toBe(
      "First session on the board. Every number from here is a target."
    );
    expect(h[0].beats).toEqual([]);
  });

  it("zero beats with history gets the honest consolidation frame", () => {
    const same = day1("s2", "2026-06-12"); // identical numbers
    const h = generateHighlights(EXERCISES, [day1()], same);
    expect(h[0].line).toBe("All numbers held. Consolidation day.");
  });

  it("singular copy for exactly one beat", () => {
    const s2 = makeSession("s2", "2026-06-12", [["leg-press", 1, 41, 10]]);
    const h = generateHighlights(EXERCISES, [day1()], s2);
    expect(h[0].line).toBe("You beat 1 number: leg press 39→41kg.");
  });

  it("lists every beat with per-kind detail", () => {
    const s2 = makeSession("s2", "2026-06-12", [
      ["leg-press", 1, 41, 10], // weight beat
      ["back-extension", 1, null, 13],
      ["back-extension", 2, null, 12], // total reps 25 > 24
      ["chest-press", 1, 32, 13],
      ["chest-press", 2, 32, 12], // reps at weight 25 > 24
      ["farmers-carry", 1, 16, 70],
      ["farmers-carry", 2, 16, 60], // steps at weight 130 > 120
    ]);
    const h = generateHighlights(EXERCISES, [day1()], s2);
    expect(h[0].line).toBe(
      "You beat 4 numbers: leg press 39→41kg, back extension 25 reps (was 24), " +
        "chest press 25 reps at 32kg (was 24), farmer's carry 130 steps at 16kg (was 120)."
    );
    expect(h[0].beats).toHaveLength(4);
  });
});

// ---- frequency ----

describe("frequency generator", () => {
  it("stays silent on the 1st session of the week AND month", () => {
    // 1 Jun 2026 is a Monday — fresh week, fresh month.
    const s = makeSession("s1", "2026-06-01", [["leg-press", 1, 32, 12]]);
    const h = generateHighlights(EXERCISES, [], s);
    expect(byId(h, "frequency")).toBeUndefined();
  });

  it("fires '2nd session this week' for two sessions in one Mon-Sun window", () => {
    const s1 = day1("s1", "2026-06-10"); // Wed
    const s2 = makeSession("s2", "2026-06-12", [["leg-press", 1, 41, 10]]); // Fri
    const h = generateHighlights(EXERCISES, [s1], s2);
    expect(byId(h, "frequency")?.line).toBe("2nd session this week.");
  });

  it("a Monday session does NOT count the previous week (Monday start)", () => {
    const sun = makeSession("s1", "2026-06-14", [["leg-press", 1, 32, 12]]);
    const mon = makeSession("s2", "2026-06-15", [["leg-press", 1, 41, 10]]);
    const h = generateHighlights(EXERCISES, [sun], mon);
    // Week count is 1 → falls through to the month line (2nd in June).
    expect(byId(h, "frequency")?.line).toBe("2nd session in June.");
  });

  it("counts the month when the week has only this session", () => {
    const s1 = day1("s1", "2026-06-02");
    const s2 = day1("s2", "2026-06-04");
    const s3 = makeSession("s3", "2026-06-10", [["leg-press", 1, 41, 10]]);
    const h = generateHighlights(EXERCISES, [s1, s2], s3);
    expect(byId(h, "frequency")?.line).toBe("3rd session in June.");
  });

  it("reproduces the spec example: '5th session in June' across distinct weeks", () => {
    // Mondays/Thursdays across June — today is always the 1st of ITS week,
    // so the month line carries the count.
    const prior = [
      day1("s1", "2026-06-01"),
      day1("s2", "2026-06-04"),
      day1("s3", "2026-06-08"),
      day1("s4", "2026-06-11"),
    ];
    const s5 = makeSession("s5", "2026-06-15", [["leg-press", 1, 41, 10]]);
    const h = generateHighlights(EXERCISES, prior, s5);
    expect(byId(h, "frequency")?.line).toBe("5th session in June.");
  });

  it("week line wins over month line when both would fire", () => {
    const s1 = day1("s1", "2026-06-02");
    const s2 = day1("s2", "2026-06-09"); // Tue, same week as s3
    const s3 = makeSession("s3", "2026-06-10", [["leg-press", 1, 41, 10]]);
    const h = generateHighlights(EXERCISES, [s1, s2], s3);
    expect(byId(h, "frequency")?.line).toBe("2nd session this week.");
  });

  it("buckets by Lisbon days: a 23:30 UTC summer session lands on the next day", () => {
    // 23:30 UTC on 14 Jun = 00:30 Lisbon on 15 Jun (Monday) — NEW week.
    const sun = makeSession("s1", "2026-06-14", [["leg-press", 1, 32, 12]]);
    const lateNight = makeSession("s2", "2026-06-14", [["leg-press", 1, 41, 10]], {
      hourUtc: 23.5 as number,
    });
    // hourUtc fractional isn't supported by Date.UTC cleanly — build explicitly:
    lateNight.completed_at = Date.UTC(2026, 5, 14, 23, 30);
    lateNight.started_at = lateNight.completed_at - 30 * 60 * 1000;
    const h = generateHighlights(EXERCISES, [sun], lateNight);
    // If this bucketed in UTC it would say "2nd session this week".
    expect(byId(h, "frequency")?.line).toBe("2nd session in June.");
  });
});

// ---- rest gap + streak (mutually exclusive) ----

describe("rest-gap greeter", () => {
  it("silent for the first session ever", () => {
    const h = generateHighlights(EXERCISES, [], day1());
    expect(byId(h, "rest_gap")).toBeUndefined();
  });

  it("silent for a 2-day gap", () => {
    const s2 = makeSession("s2", "2026-06-12", [["leg-press", 1, 41, 10]]);
    const h = generateHighlights(EXERCISES, [day1()], s2);
    expect(byId(h, "rest_gap")).toBeUndefined();
  });

  it("fires at a 3-day gap", () => {
    const s2 = makeSession("s2", "2026-06-13", [["leg-press", 1, 41, 10]]);
    const h = generateHighlights(EXERCISES, [day1()], s2);
    expect(byId(h, "rest_gap")?.line).toBe("Welcome back after 3 days off.");
  });

  it("counts calendar days in Lisbon, not raw 72-hour windows", () => {
    // 10 Jun 23:30 Lisbon (22:30 UTC) → 13 Jun 08:00 Lisbon is < 72h
    // but 3 calendar days apart — fires.
    const s1 = day1("s1", "2026-06-10");
    s1.completed_at = Date.UTC(2026, 5, 10, 22, 30); // 23:30 Lisbon, still 10 Jun
    const s2 = makeSession("s2", "2026-06-13", [["leg-press", 1, 41, 10]], { hourUtc: 7 });
    const h = generateHighlights(EXERCISES, [s1], s2);
    expect(byId(h, "rest_gap")?.line).toBe("Welcome back after 3 days off.");
  });
});

describe("improvement streak", () => {
  it("silent when today's session has no beats", () => {
    const same = day1("s2", "2026-06-11");
    const h = generateHighlights(EXERCISES, [day1()], same);
    expect(byId(h, "streak")).toBeUndefined();
  });

  it("silent at streak 1 (first session with a beat after a beat-less one)", () => {
    const s2 = makeSession("s2", "2026-06-11", [["leg-press", 1, 41, 10]]);
    // Day 1 had no beats (first ever) → trailing streak is just s2.
    const h = generateHighlights(EXERCISES, [day1()], s2);
    expect(byId(h, "streak")).toBeUndefined();
  });

  it("fires at 2 in a row and counts correctly at 3", () => {
    const s2 = makeSession("s2", "2026-06-11", [["leg-press", 1, 41, 10]]);
    const s3 = makeSession("s3", "2026-06-12", [["leg-press", 1, 43, 10]]);
    let h = generateHighlights(EXERCISES, [day1(), s2], s3);
    expect(byId(h, "streak")?.line).toBe("2nd session in a row with at least one beat.");

    const s4 = makeSession("s4", "2026-06-13", [["leg-press", 1, 45, 10]]);
    h = generateHighlights(EXERCISES, [day1(), s2, s3], s4);
    // 13 Jun is 1 day after 12 Jun — no rest gap; streak counts s2,s3,s4.
    expect(byId(h, "streak")?.line).toBe("3rd session in a row with at least one beat.");
  });

  it("a beat-less session breaks the chain", () => {
    const s2 = makeSession("s2", "2026-06-11", [["leg-press", 1, 41, 10]]);
    const s3 = makeSession("s3", "2026-06-12", [["leg-press", 1, 41, 10]]); // held
    const s4 = makeSession("s4", "2026-06-13", [["leg-press", 1, 43, 10]]); // beat again
    const h = generateHighlights(EXERCISES, [day1(), s2, s3], s4);
    expect(byId(h, "streak")).toBeUndefined(); // streak is 1 → silent
  });

  it("rest-gap wins when both rest-gap and streak are true", () => {
    const s2 = makeSession("s2", "2026-06-11", [["leg-press", 1, 41, 10]]);
    const s3 = makeSession("s3", "2026-06-15", [["leg-press", 1, 43, 10]]); // 4-day gap, also a beat
    const h = generateHighlights(EXERCISES, [day1(), s2], s3);
    expect(byId(h, "rest_gap")?.line).toBe("Welcome back after 4 days off.");
    expect(byId(h, "streak")).toBeUndefined();
  });

  it("streak wins below the gap threshold: never both lines at once", () => {
    const s2 = makeSession("s2", "2026-06-11", [["leg-press", 1, 41, 10]]);
    const s3 = makeSession("s3", "2026-06-13", [["leg-press", 1, 43, 10]]); // 2-day gap + a beat
    const h = generateHighlights(EXERCISES, [day1(), s2], s3);
    expect(byId(h, "streak")?.line).toBe("2nd session in a row with at least one beat.");
    expect(byId(h, "rest_gap")).toBeUndefined();
  });
});

// ---- next target ----

describe("next target", () => {
  it("after day 1: back extension's one-more-rep is the lowest-hanging beat", () => {
    // Day-1 state: back extension is the only cost-1 target (every
    // weighted exercise hit its ceiling at the top weight).
    const h = generateHighlights(EXERCISES, [], day1());
    expect(byId(h, "next_target")?.line).toBe(
      "Next time: one more rep on back extension is there for the taking."
    );
  });

  it("reproduces the spec example: 12s across the board at 39kg suggests 41kg leg press", () => {
    const s = makeSession("s1", "2026-06-10", [
      ["leg-press", 1, 39, 12],
      ["leg-press", 2, 39, 12],
    ]);
    const h = generateHighlights([LEG], [], s);
    expect(byId(h, "next_target")?.line).toBe(
      "Next time: 41kg leg press is there for the taking."
    );
  });

  it("a series below the ceiling at the top weight keeps the target on reps", () => {
    const s = makeSession("s1", "2026-06-10", [
      ["seated-row", 1, 32, 12],
      ["seated-row", 2, 32, 10], // not all at 12 yet
    ]);
    const h = generateHighlights([ROW], [], s);
    expect(byId(h, "next_target")?.line).toBe(
      "Next time: one more rep at 32kg on seated row is there for the taking."
    );
  });

  it("series below the top weight don't gate the weight suggestion", () => {
    // Warmup at 32 doesn't matter; both 39 series hit 12 → suggest 41.
    const s = makeSession("s1", "2026-06-10", [
      ["leg-press", 1, 32, 8],
      ["leg-press", 2, 39, 12],
      ["leg-press", 3, 39, 12],
    ]);
    const h = generateHighlights([LEG], [], s);
    expect(byId(h, "next_target")?.line).toBe(
      "Next time: 41kg leg press is there for the taking."
    );
  });

  it("carry below the step ceiling suggests 10 more steps", () => {
    const s = makeSession("s1", "2026-06-10", [
      ["farmers-carry", 1, 16, 45],
      ["farmers-carry", 2, 16, 50],
    ]);
    const h = generateHighlights([CARRY], [], s);
    expect(byId(h, "next_target")?.line).toBe(
      "Next time: 10 more steps at 16kg on farmer's carry is there for the taking."
    );
  });

  it("carry at the step ceiling suggests a 2kg step", () => {
    const s = makeSession("s1", "2026-06-10", [
      ["farmers-carry", 1, 16, 60],
      ["farmers-carry", 2, 16, 60],
    ]);
    const h = generateHighlights([CARRY], [], s);
    expect(byId(h, "next_target")?.line).toBe(
      "Next time: 18kg farmer's carry is there for the taking."
    );
  });

  it("uses TODAY's numbers for exercises done today, older numbers otherwise", () => {
    // Today only chest, leaving it one rep short of the ceiling.
    const s2 = makeSession("s2", "2026-06-12", [
      ["chest-press", 1, 34, 12],
      ["chest-press", 2, 34, 11],
    ]);
    const h = generateHighlights([CHEST], [day1()], s2);
    expect(byId(h, "next_target")?.line).toBe(
      "Next time: one more rep at 34kg on chest press is there for the taking."
    );
  });

  it("ties between same-cost targets break by catalog sort_order", () => {
    // Both leg press (order 1) and seated row (order 4) sit on reps targets.
    const s = makeSession("s1", "2026-06-10", [
      ["seated-row", 1, 32, 10],
      ["leg-press", 1, 39, 10],
    ]);
    const h = generateHighlights([ROW, LEG], [], s);
    expect(byId(h, "next_target")?.line).toContain("leg press");
  });

  it("silent when there is no history at all to aim from", () => {
    const empty = makeSession("s1", "2026-06-10", []);
    const h = generateHighlights(EXERCISES, [], empty);
    expect(byId(h, "next_target")).toBeUndefined();
  });

  it("suggests ONE modest increment, never two, however far past the ceiling", () => {
    // Reps way beyond 12 still suggest 39+2=41, not 43.
    const s = makeSession("s1", "2026-06-10", [
      ["leg-press", 1, 39, 18],
      ["leg-press", 2, 39, 16],
    ]);
    const h = generateHighlights([LEG], [], s);
    expect(byId(h, "next_target")?.line).toBe(
      "Next time: 41kg leg press is there for the taking."
    );
  });

  it("carry far past the step ceiling still suggests a single 2kg step", () => {
    const s = makeSession("s1", "2026-06-10", [
      ["farmers-carry", 1, 16, 90],
      ["farmers-carry", 2, 16, 85],
    ]);
    const h = generateHighlights([CARRY], [], s);
    expect(byId(h, "next_target")?.line).toBe(
      "Next time: 18kg farmer's carry is there for the taking."
    );
  });
});

// ---- assembly rules ----

describe("highlights assembly", () => {
  it("beats is always first; max 3 secondary lines, priority-ordered", () => {
    // Construct a day where rest_gap, frequency and next_target all fire.
    const s1 = day1("s1", "2026-06-02");
    const s2 = day1("s2", "2026-06-09");
    const s3 = makeSession("s3", "2026-06-12", [["leg-press", 1, 41, 10]]);
    const h = generateHighlights(EXERCISES, [s1, s2], s3);
    expect(h[0].id).toBe("beats");
    expect(h.length).toBeLessThanOrEqual(4);
    const priorities = h.slice(1).map((x) => x.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
    expect(h.map((x) => x.id)).toEqual(["beats", "rest_gap", "frequency", "next_target"]);
  });

  it("day-2 of the real plan: beats + frequency + next target", () => {
    // What tomorrow at Breathe should produce if he nudges two numbers.
    const s2 = makeSession("s2", "2026-06-11", [
      ["leg-press", 1, 39, 12],
      ["leg-press", 2, 41, 10], // beat: 41 > 39
      ["back-extension", 1, null, 13],
      ["back-extension", 2, null, 12], // beat: 25 > 24
      ["chest-press", 1, 32, 12],
      ["chest-press", 2, 32, 12],
      ["seated-row", 1, 25, 12],
      ["seated-row", 2, 32, 12],
      ["farmers-carry", 1, 16, 60],
      ["farmers-carry", 2, 16, 60],
    ]);
    const h = generateHighlights(EXERCISES, [day1()], s2);
    expect(h[0].line).toBe(
      "You beat 2 numbers: leg press 39→41kg, back extension 25 reps (was 24)."
    );
    expect(byId(h, "frequency")?.line).toBe("2nd session this week.");
    expect(byId(h, "rest_gap")).toBeUndefined();
    expect(byId(h, "streak")).toBeUndefined(); // day 1 had no beats
    expect(byId(h, "next_target")).toBeDefined();
  });
});

describe("fmtKg", () => {
  it("integers render bare, decimals render to one place", () => {
    expect(fmtKg(39)).toBe("39");
    expect(fmtKg(2.5)).toBe("2.5");
    expect(fmtKg(2.55)).toBe("2.6");
  });
});
