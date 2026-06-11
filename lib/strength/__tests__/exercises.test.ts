import { describe, it, expect } from "vitest";
import {
  MEASUREMENT_TYPES,
  baseSlug,
  isMeasurementType,
  nameKey,
  resolveExerciseId,
  validateCreateExercise,
} from "../exercises";

describe("isMeasurementType", () => {
  it("accepts the three known types", () => {
    for (const t of MEASUREMENT_TYPES) {
      expect(isMeasurementType(t)).toBe(true);
    }
    expect(MEASUREMENT_TYPES).toEqual([
      "weight_reps",
      "bodyweight_reps",
      "carry",
    ]);
  });

  it("rejects anything else", () => {
    expect(isMeasurementType("cardio")).toBe(false);
    expect(isMeasurementType("")).toBe(false);
    expect(isMeasurementType(null)).toBe(false);
    expect(isMeasurementType(42)).toBe(false);
  });
});

describe("validateCreateExercise", () => {
  it("accepts a full valid body and trims", () => {
    const r = validateCreateExercise({
      name: "  Hack Squat  ",
      measurement_type: "weight_reps",
      description: "  Sit, push through heels.  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.name).toBe("Hack Squat");
      expect(r.input.measurement_type).toBe("weight_reps");
      expect(r.input.description).toBe("Sit, push through heels.");
    }
  });

  it("defaults missing description to empty string", () => {
    const r = validateCreateExercise({
      name: "Hack Squat",
      measurement_type: "carry",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.description).toBe("");
  });

  it("rejects a non-object body", () => {
    expect(validateCreateExercise(null).ok).toBe(false);
    expect(validateCreateExercise("nope").ok).toBe(false);
  });

  it("rejects empty / whitespace-only name", () => {
    expect(validateCreateExercise({ name: "", measurement_type: "carry" }).ok).toBe(false);
    expect(validateCreateExercise({ name: "   ", measurement_type: "carry" }).ok).toBe(false);
  });

  it("rejects a non-string name", () => {
    expect(validateCreateExercise({ name: 7, measurement_type: "carry" }).ok).toBe(false);
  });

  it("rejects an unknown measurement_type", () => {
    const r = validateCreateExercise({ name: "X", measurement_type: "cardio" });
    // `=== false`, not `!r.ok`: strict:false weakens union narrowing on the
    // `error` member access (mirrors the route + sessions-route pattern).
    expect(r.ok === false && r.error.includes("measurement_type")).toBe(true);
  });

  it("rejects a too-long name", () => {
    const r = validateCreateExercise({
      name: "a".repeat(81),
      measurement_type: "weight_reps",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-string description", () => {
    const r = validateCreateExercise({
      name: "X",
      measurement_type: "weight_reps",
      description: 5,
    });
    expect(r.ok).toBe(false);
  });
});

describe("nameKey", () => {
  it("case-folds, trims, and collapses inner whitespace", () => {
    expect(nameKey("  Hack   Squat ")).toBe("hack squat");
    expect(nameKey("HACK SQUAT")).toBe("hack squat");
  });

  it("makes near-duplicates compare equal", () => {
    expect(nameKey("Leg  Press")).toBe(nameKey("leg press"));
  });
});

describe("baseSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(baseSlug("Hack Squat")).toBe("hack-squat");
    expect(baseSlug("Leg Press!")).toBe("leg-press");
    expect(baseSlug("Pull-up (assisted)")).toBe("pull-up-assisted");
  });

  it("falls back to 'exercise' for all-punctuation names", () => {
    expect(baseSlug("!!!")).toBe("exercise");
  });
});

describe("resolveExerciseId", () => {
  it("returns the bare slug when free", () => {
    expect(resolveExerciseId("Hack Squat", ["leg-press", "seated-row"])).toBe("hack-squat");
  });

  it("suffixes -2, -3 on collision", () => {
    expect(resolveExerciseId("Leg Press", ["leg-press"])).toBe("leg-press-2");
    expect(resolveExerciseId("Leg Press", ["leg-press", "leg-press-2"])).toBe("leg-press-3");
  });

  it("skips to the first free suffix, not necessarily -2", () => {
    expect(
      resolveExerciseId("Leg Press", ["leg-press", "leg-press-3"])
    ).toBe("leg-press-2");
  });

  it("is deterministic given the same existing set", () => {
    const ids = ["hack-squat", "hack-squat-2"];
    expect(resolveExerciseId("Hack Squat", ids)).toBe("hack-squat-3");
    expect(resolveExerciseId("Hack Squat", ids)).toBe("hack-squat-3");
  });
});
