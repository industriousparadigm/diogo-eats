import { describe, it, expect } from "vitest";
import { validateSessionPayload } from "../validate";
import type { Exercise } from "../types";

// ---- fixtures (mirror engine.test.ts) ----

const LEG: Exercise = {
  id: "leg-press",
  name: "Leg press",
  description: "",
  measurement_type: "weight_reps",
  image_key: "leg-press",
  sort_order: 1,
};
const BACK: Exercise = {
  id: "back-extension",
  name: "Back extension",
  description: "",
  measurement_type: "bodyweight_reps",
  image_key: "back-extension",
  sort_order: 2,
};
const CHEST: Exercise = {
  id: "chest-press",
  name: "Chest press",
  description: "",
  measurement_type: "weight_reps",
  image_key: "chest-press",
  sort_order: 3,
};
const ROW: Exercise = {
  id: "seated-row",
  name: "Seated row",
  description: "",
  measurement_type: "weight_reps",
  image_key: "seated-row",
  sort_order: 4,
};
const CARRY: Exercise = {
  id: "farmers-carry",
  name: "Farmer's carry",
  description: "",
  measurement_type: "carry",
  image_key: "farmers-carry",
  sort_order: 5,
};
const EXERCISES = [LEG, BACK, CHEST, ROW, CARRY];

// Fixed clock: 10 Jun 2026 12:00 UTC. Every relative-time rule is
// tested against this, never against the real Date.now().
const NOW = Date.UTC(2026, 5, 10, 12, 0, 0);
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const ONE_SET = [{ exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 12 }];

function base(overrides: Record<string, unknown> = {}) {
  return {
    started_at: NOW - HOUR,
    completed_at: NOW,
    note: null,
    sets: ONE_SET,
    ...overrides,
  };
}

function run(body: unknown) {
  return validateSessionPayload(body, EXERCISES, NOW);
}

function expectError(body: unknown, fragment: string) {
  const r = run(body);
  expect(r.ok).toBe(false);
  if (r.ok === false) expect(r.error).toContain(fragment);
}

// ---- body shape ----

describe("validateSessionPayload — body shape", () => {
  it("rejects null / undefined / primitives", () => {
    expectError(null, "JSON object");
    expectError(undefined, "JSON object");
    expectError("a string", "JSON object");
    expectError(42, "JSON object");
  });

  it("an array body fails on the timestamp fields, not mysteriously later", () => {
    expectError([], "started_at");
  });
});

// ---- timestamps ----

describe("validateSessionPayload — timestamps", () => {
  it("rejects missing or non-numeric started_at / completed_at", () => {
    expectError(base({ started_at: undefined }), "ms epoch");
    expectError(base({ completed_at: undefined }), "ms epoch");
    expectError(base({ started_at: "2026-06-10" }), "ms epoch");
    expectError(base({ completed_at: NaN }), "ms epoch");
    expectError(base({ completed_at: Infinity }), "ms epoch");
  });

  it("rejects completed_at before started_at", () => {
    expectError(base({ started_at: NOW, completed_at: NOW - 1 }), "precede");
  });

  it("allows a zero-length session (completed == started)", () => {
    expect(run(base({ started_at: NOW, completed_at: NOW })).ok).toBe(true);
  });

  it("rejects sessions longer than 12 hours, allows exactly 12", () => {
    expectError(
      base({ started_at: NOW - 12 * HOUR - 1, completed_at: NOW }),
      "12 hours"
    );
    expect(run(base({ started_at: NOW - 12 * HOUR, completed_at: NOW })).ok).toBe(true);
  });

  it("rejects completed_at beyond the 5-minute future slack, allows within it", () => {
    expectError(
      base({ started_at: NOW, completed_at: NOW + 5 * 60 * 1000 + 1 }),
      "future"
    );
    expect(
      run(base({ started_at: NOW, completed_at: NOW + 5 * 60 * 1000 })).ok
    ).toBe(true);
  });

  it("rejects sessions older than 7 days, allows exactly 7", () => {
    expectError(
      base({ started_at: NOW - 7 * DAY - HOUR, completed_at: NOW - 7 * DAY - 1 }),
      "older than 7 days"
    );
    expect(
      run(base({ started_at: NOW - 7 * DAY - HOUR, completed_at: NOW - 7 * DAY })).ok
    ).toBe(true);
  });

  it("floors fractional timestamps", () => {
    const r = run(base({ started_at: NOW - HOUR + 0.9, completed_at: NOW + 0.7 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.started_at).toBe(NOW - HOUR);
      expect(r.payload.completed_at).toBe(NOW);
    }
  });
});

// ---- note ----

describe("validateSessionPayload — note", () => {
  it("missing and null both normalize to null", () => {
    const r1 = run(base({ note: undefined }));
    const r2 = run(base({ note: null }));
    expect(r1.ok && r1.payload.note).toBe(null);
    expect(r2.ok && r2.payload.note).toBe(null);
  });

  it("rejects a non-string note", () => {
    expectError(base({ note: 42 }), "string");
  });

  it("trims, and whitespace-only becomes null", () => {
    const r1 = run(base({ note: "  banho turco  " }));
    expect(r1.ok && r1.payload.note).toBe("banho turco");
    const r2 = run(base({ note: "   " }));
    expect(r2.ok && r2.payload.note).toBe(null);
  });

  it("rejects notes over 2000 chars, allows exactly 2000", () => {
    expectError(base({ note: "x".repeat(2001) }), "too long");
    expect(run(base({ note: "x".repeat(2000) })).ok).toBe(true);
  });
});

// ---- sets: collection rules ----

describe("validateSessionPayload — sets collection", () => {
  it("rejects missing, non-array, and empty sets", () => {
    expectError(base({ sets: undefined }), "at least one set");
    expectError(base({ sets: {} }), "at least one set");
    expectError(base({ sets: [] }), "at least one set");
  });

  it("rejects more than 200 sets, allows exactly 200", () => {
    // 4 exercises x 50 series = 200 valid sets (series_index caps at 50).
    const make = (n: number) => {
      const ids = ["leg-press", "chest-press", "seated-row", "back-extension"];
      const sets = [];
      for (let i = 0; i < n; i++) {
        const exercise_id = ids[Math.floor(i / 50) % ids.length];
        sets.push({
          exercise_id,
          series_index: (i % 50) + 1,
          weight_kg: exercise_id === "back-extension" ? null : 20,
          reps: 10,
        });
      }
      return sets;
    };
    expect(run(base({ sets: make(200) })).ok).toBe(true);
    expectError(base({ sets: [...make(200), ...ONE_SET] }), "too many");
  });

  it("rejects invalid set elements", () => {
    expectError(base({ sets: [null] }), "invalid set shape");
    expectError(base({ sets: ["leg-press"] }), "invalid set shape");
  });
});

// ---- sets: per-set field rules ----

describe("validateSessionPayload — exercise_id", () => {
  it("rejects a missing or non-string exercise_id", () => {
    expectError(base({ sets: [{ series_index: 1, weight_kg: 32, reps: 12 }] }), "exercise_id");
    expectError(
      base({ sets: [{ exercise_id: 7, series_index: 1, weight_kg: 32, reps: 12 }] }),
      "exercise_id"
    );
  });

  it("rejects an exercise not in the catalog, naming it", () => {
    expectError(
      base({ sets: [{ exercise_id: "deadlift", series_index: 1, weight_kg: 60, reps: 5 }] }),
      "unknown exercise: deadlift"
    );
  });
});

describe("validateSessionPayload — series_index", () => {
  const set = (series_index: unknown) => ({
    exercise_id: "leg-press",
    series_index,
    weight_kg: 32,
    reps: 12,
  });

  it("rejects 0, 51, fractions, strings, missing", () => {
    for (const bad of [0, 51, 1.5, "2", undefined]) {
      expectError(base({ sets: [set(bad)] }), "series_index");
    }
  });

  it("allows the 1..50 bounds", () => {
    expect(run(base({ sets: [set(1)] })).ok).toBe(true);
    expect(run(base({ sets: [set(50)] })).ok).toBe(true);
  });

  it("rejects a duplicate series for the same exercise, naming it", () => {
    expectError(
      base({ sets: [set(1), set(1)] }),
      "duplicate series 1 for Leg press"
    );
  });

  it("the same series index on DIFFERENT exercises is fine", () => {
    const r = run(
      base({
        sets: [
          set(1),
          { exercise_id: "chest-press", series_index: 1, weight_kg: 32, reps: 12 },
        ],
      })
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateSessionPayload — reps", () => {
  const set = (reps: unknown) => ({
    exercise_id: "leg-press",
    series_index: 1,
    weight_kg: 32,
    reps,
  });

  it("rejects 0, negatives, fractions, strings, missing, and >1000", () => {
    for (const bad of [0, -1, 2.5, "12", undefined, 1001]) {
      expectError(base({ sets: [set(bad)] }), "reps");
    }
  });

  it("allows 1000 — carries log steps and need the headroom", () => {
    const r = run(
      base({
        sets: [{ exercise_id: "farmers-carry", series_index: 1, weight_kg: 16, reps: 1000 }],
      })
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateSessionPayload — weight_kg", () => {
  it("weight_reps requires a weight, naming the exercise", () => {
    expectError(
      base({ sets: [{ exercise_id: "leg-press", series_index: 1, reps: 12 }] }),
      "Leg press needs a weight"
    );
    expectError(
      base({ sets: [{ exercise_id: "leg-press", series_index: 1, weight_kg: null, reps: 12 }] }),
      "Leg press needs a weight"
    );
  });

  it("carry requires a weight too", () => {
    expectError(
      base({ sets: [{ exercise_id: "farmers-carry", series_index: 1, reps: 60 }] }),
      "Farmer's carry needs a weight"
    );
  });

  it("rejects zero, negative, and >500kg weights", () => {
    const set = (weight_kg: number) => ({
      exercise_id: "leg-press",
      series_index: 1,
      weight_kg,
      reps: 12,
    });
    for (const bad of [0, -10, 500.5]) {
      expect(run(base({ sets: [set(bad)] })).ok).toBe(false);
    }
    expect(run(base({ sets: [set(500)] })).ok).toBe(true);
  });

  it("fractional weights are preserved exactly (2.5kg plates exist)", () => {
    const r = run(
      base({ sets: [{ exercise_id: "leg-press", series_index: 1, weight_kg: 32.5, reps: 12 }] })
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.sets[0].weight_kg).toBe(32.5);
  });

  it("bodyweight: missing and null both normalize to null", () => {
    for (const w of [undefined, null]) {
      const r = run(
        base({ sets: [{ exercise_id: "back-extension", series_index: 1, weight_kg: w, reps: 12 }] })
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.sets[0].weight_kg).toBe(null);
    }
  });

  it("bodyweight accepts added weight (the later progression path) but not 0 or >500", () => {
    const set = (weight_kg: unknown) => ({
      exercise_id: "back-extension",
      series_index: 1,
      weight_kg,
      reps: 12,
    });
    const r = run(base({ sets: [set(5)] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.sets[0].weight_kg).toBe(5);
    expectError(base({ sets: [set(0)] }), "out of range");
    expectError(base({ sets: [set(501)] }), "out of range");
  });
});

// ---- happy path: the real day-1 payload ----

describe("validateSessionPayload — day-1 round trip", () => {
  const day1Sets = [
    { exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 12 },
    { exercise_id: "leg-press", series_index: 2, weight_kg: 39, reps: 12 },
    { exercise_id: "back-extension", series_index: 1, weight_kg: null, reps: 12 },
    { exercise_id: "back-extension", series_index: 2, weight_kg: null, reps: 12 },
    { exercise_id: "chest-press", series_index: 1, weight_kg: 32, reps: 12 },
    { exercise_id: "chest-press", series_index: 2, weight_kg: 32, reps: 12 },
    { exercise_id: "seated-row", series_index: 1, weight_kg: 25, reps: 12 },
    { exercise_id: "seated-row", series_index: 2, weight_kg: 32, reps: 12 },
    { exercise_id: "farmers-carry", series_index: 1, weight_kg: 16, reps: 60 },
    { exercise_id: "farmers-carry", series_index: 2, weight_kg: 16, reps: 60 },
  ];

  it("accepts the full baseline session and preserves logged order", () => {
    const r = run(
      base({
        note: "10min warmup run, 22min run after, ~10min banho turco.",
        sets: day1Sets,
      })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.sets).toEqual(day1Sets);
      expect(r.payload.note).toBe(
        "10min warmup run, 22min run after, ~10min banho turco."
      );
    }
  });

  it("strips unknown extra fields from sets (payload is rebuilt, not passed through)", () => {
    const r = run(
      base({
        sets: [{ ...ONE_SET[0], sneaky: "field" }],
      })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.payload.sets[0]).sort()).toEqual([
        "exercise_id",
        "reps",
        "series_index",
        "weight_kg",
      ]);
    }
  });
});
