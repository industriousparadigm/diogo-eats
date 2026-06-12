import { describe, it, expect } from "vitest";
import {
  validateCreate,
  validatePatch,
  clampDays,
  ACTIVITY_TYPES,
  EFFORTS,
  DEFAULT_DAYS,
  MIN_DAYS,
  MAX_DAYS,
} from "../activities";

// Fixed clock: 12 Jun 2026 12:00 UTC. Every relative-time rule is tested
// against this, never against the real Date.now() (mirrors strength).
const NOW = Date.UTC(2026, 5, 12, 12, 0, 0);
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const MINUTE = 60 * 1000;

// A minimal valid create body.
const VALID = {
  type: "padel",
  duration_min: 90,
};

describe("validateCreate — body shape", () => {
  it("rejects a non-object body", () => {
    for (const bad of [null, undefined, 42, "x", true, []]) {
      const r = validateCreate(bad, NOW);
      // arrays are objects, but they have no type/duration → field errors
      expect(r.ok).toBe(false);
    }
  });

  it("rejects an empty object (missing type + duration)", () => {
    const r = validateCreate({}, NOW);
    expect(r.ok).toBe(false);
  });

  it("accepts the minimal valid body and defaults started_at to now", () => {
    const r = validateCreate(VALID, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.type).toBe("padel");
      expect(r.payload.duration_min).toBe(90);
      expect(r.payload.started_at).toBe(NOW);
      expect(r.payload.label).toBeNull();
      expect(r.payload.effort).toBeNull();
      expect(r.payload.distance_km).toBeNull();
      expect(r.payload.note).toBeNull();
    }
  });
});

describe("validateCreate — type whitelist", () => {
  it("accepts every whitelisted type", () => {
    for (const type of ACTIVITY_TYPES) {
      const r = validateCreate({ type, duration_min: 30 }, NOW);
      expect(r.ok, type).toBe(true);
    }
  });

  it("rejects a type not in the whitelist", () => {
    for (const type of ["yoga", "PADEL", "Run", "", "tennis", "gym"]) {
      const r = validateCreate({ type, duration_min: 30 }, NOW);
      expect(r.ok, type).toBe(false);
    }
  });

  it("rejects a non-string type", () => {
    for (const type of [1, null, undefined, true, {}, []]) {
      const r = validateCreate({ type, duration_min: 30 }, NOW);
      expect(r.ok).toBe(false);
    }
  });
});

describe("validateCreate — duration bounds", () => {
  it("accepts 1 and 1440 (inclusive bounds)", () => {
    expect(validateCreate({ ...VALID, duration_min: 1 }, NOW).ok).toBe(true);
    expect(validateCreate({ ...VALID, duration_min: 1440 }, NOW).ok).toBe(true);
  });

  it("rejects 0, negative, and > 1440", () => {
    for (const d of [0, -1, -90, 1441, 5000]) {
      expect(validateCreate({ ...VALID, duration_min: d }, NOW).ok, String(d)).toBe(false);
    }
  });

  it("rejects non-integer durations", () => {
    for (const d of [90.5, 0.1, NaN, Infinity, -Infinity]) {
      expect(validateCreate({ ...VALID, duration_min: d }, NOW).ok, String(d)).toBe(false);
    }
  });

  it("rejects non-number durations and a missing duration", () => {
    for (const d of ["90", null, undefined, true, {}]) {
      expect(validateCreate({ type: "run", duration_min: d }, NOW).ok).toBe(false);
    }
    expect(validateCreate({ type: "run" }, NOW).ok).toBe(false);
  });
});

describe("validateCreate — effort whitelist", () => {
  it("accepts each effort value plus null/omitted", () => {
    for (const effort of EFFORTS) {
      expect(validateCreate({ ...VALID, effort }, NOW).ok, effort).toBe(true);
    }
    expect(validateCreate({ ...VALID, effort: null }, NOW).ok).toBe(true);
    expect(validateCreate({ ...VALID, effort: undefined }, NOW).ok).toBe(true);
  });

  it("rejects effort values outside the whitelist", () => {
    for (const effort of ["easy", "max", "HARD", "", "medium", 2]) {
      expect(validateCreate({ ...VALID, effort }, NOW).ok, String(effort)).toBe(false);
    }
  });
});

describe("validateCreate — distance positivity", () => {
  it("accepts a positive distance and null/omitted", () => {
    expect(validateCreate({ ...VALID, distance_km: 5.2 }, NOW).ok).toBe(true);
    expect(validateCreate({ ...VALID, distance_km: 0.01 }, NOW).ok).toBe(true);
    expect(validateCreate({ ...VALID, distance_km: null }, NOW).ok).toBe(true);
    expect(validateCreate({ ...VALID, distance_km: undefined }, NOW).ok).toBe(true);
  });

  it("rejects zero and negative distance", () => {
    for (const d of [0, -1, -0.5]) {
      expect(validateCreate({ ...VALID, distance_km: d }, NOW).ok, String(d)).toBe(false);
    }
  });

  it("rejects non-finite and non-number distance, and absurdly large", () => {
    for (const d of [NaN, Infinity, "5", true, {}, 100000]) {
      expect(validateCreate({ ...VALID, distance_km: d }, NOW).ok, String(d)).toBe(false);
    }
  });
});

describe("validateCreate — label / note normalisation", () => {
  it("trims and stores label/note; blanks become null", () => {
    const r = validateCreate({ ...VALID, label: "  class  ", note: "  good  " }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.label).toBe("class");
      expect(r.payload.note).toBe("good");
    }
    const blank = validateCreate({ ...VALID, label: "   ", note: "" }, NOW);
    expect(blank.ok).toBe(true);
    if (blank.ok) {
      expect(blank.payload.label).toBeNull();
      expect(blank.payload.note).toBeNull();
    }
  });

  it("rejects non-string label/note and over-long text", () => {
    expect(validateCreate({ ...VALID, label: 1 }, NOW).ok).toBe(false);
    expect(validateCreate({ ...VALID, note: {} }, NOW).ok).toBe(false);
    expect(validateCreate({ ...VALID, label: "x".repeat(201) }, NOW).ok).toBe(false);
    expect(validateCreate({ ...VALID, note: "x".repeat(2001) }, NOW).ok).toBe(false);
  });
});

describe("validateCreate — started_at window", () => {
  it("accepts an explicit started_at within the window and floors it", () => {
    const r = validateCreate({ ...VALID, started_at: NOW - DAY + 0.9 }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.started_at).toBe(Math.floor(NOW - DAY + 0.9));
  });

  it("accepts within 5min future slack, rejects beyond it", () => {
    expect(validateCreate({ ...VALID, started_at: NOW + 4 * MINUTE }, NOW).ok).toBe(true);
    expect(validateCreate({ ...VALID, started_at: NOW + 10 * MINUTE }, NOW).ok).toBe(false);
  });

  it("rejects a started_at older than a year", () => {
    expect(validateCreate({ ...VALID, started_at: NOW - 364 * DAY }, NOW).ok).toBe(true);
    expect(validateCreate({ ...VALID, started_at: NOW - 366 * DAY }, NOW).ok).toBe(false);
  });

  it("rejects a non-number started_at", () => {
    for (const s of ["123", true, {}, NaN, Infinity]) {
      expect(validateCreate({ ...VALID, started_at: s }, NOW).ok, String(s)).toBe(false);
    }
  });
});

describe("validatePatch — partial updates", () => {
  it("rejects a non-object body", () => {
    for (const bad of [null, undefined, 42, "x"]) {
      expect(validatePatch(bad, NOW).ok).toBe(false);
    }
  });

  it("rejects an empty patch (nothing to update)", () => {
    const r = validatePatch({}, NOW);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toBe("nothing to update");
  });

  it("accepts a single-field patch and returns only that key", () => {
    const r = validatePatch({ duration_min: 45 }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({ duration_min: 45 });
    }
  });

  it("validates each present field with the same rules as create", () => {
    expect(validatePatch({ type: "yoga" }, NOW).ok).toBe(false);
    expect(validatePatch({ duration_min: 0 }, NOW).ok).toBe(false);
    expect(validatePatch({ duration_min: 1441 }, NOW).ok).toBe(false);
    expect(validatePatch({ effort: "max" }, NOW).ok).toBe(false);
    expect(validatePatch({ distance_km: -1 }, NOW).ok).toBe(false);
    expect(validatePatch({ started_at: NOW + 10 * MINUTE }, NOW).ok).toBe(false);
  });

  it("lets nullable fields be cleared to null via the patch", () => {
    const r = validatePatch({ effort: null, distance_km: null, label: null, note: null }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.effort).toBeNull();
      expect(r.payload.distance_km).toBeNull();
      expect(r.payload.label).toBeNull();
      expect(r.payload.note).toBeNull();
    }
  });

  it("normalises a present label/note (trim, blank → null)", () => {
    const r = validatePatch({ label: "  match  " }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.label).toBe("match");
    const blank = validatePatch({ note: "   " }, NOW);
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.payload.note).toBeNull();
  });

  it("accepts a full multi-field patch", () => {
    const r = validatePatch(
      { type: "run", label: "tempo", started_at: NOW - HOUR, duration_min: 35, effort: "hard", distance_km: 7.5, note: "felt strong" },
      NOW
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({
        type: "run",
        label: "tempo",
        started_at: NOW - HOUR,
        duration_min: 35,
        effort: "hard",
        distance_km: 7.5,
        note: "felt strong",
      });
    }
  });
});

describe("clampDays", () => {
  it("defaults to 30 for missing / null / non-numeric", () => {
    for (const v of [null, undefined, "", "abc", NaN, {}, "12.5"]) {
      expect(clampDays(v), String(v)).toBe(DEFAULT_DAYS);
    }
  });

  it("parses a numeric string", () => {
    expect(clampDays("7")).toBe(7);
    expect(clampDays("365")).toBe(365);
  });

  it("clamps below 1 up to 1 and above 365 down to 365", () => {
    expect(clampDays("0")).toBe(MIN_DAYS);
    expect(clampDays("-5")).toBe(MIN_DAYS);
    expect(clampDays("1000")).toBe(MAX_DAYS);
    expect(clampDays(99999)).toBe(MAX_DAYS);
  });

  it("rejects non-integer numbers to the default", () => {
    expect(clampDays(12.5)).toBe(DEFAULT_DAYS);
    expect(clampDays(Infinity)).toBe(DEFAULT_DAYS);
  });

  it("passes valid integers through unchanged", () => {
    expect(clampDays(1)).toBe(1);
    expect(clampDays(30)).toBe(30);
    expect(clampDays(365)).toBe(365);
    expect(clampDays(200)).toBe(200);
  });
});
