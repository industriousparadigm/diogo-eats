import { describe, it, expect } from "vitest";
import { normalizeParsedActivity } from "../activityVision";

// Fixed clock: 15 Jun 2026 12:00 UTC. Every started_at window rule is tested
// against this, never the real Date.now().
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY = 24 * 3600 * 1000;

// A fully-populated, valid raw payload to spread over and mutate per-case.
const RAW = {
  type: "run",
  distance_km: 8.2,
  duration_min: 47,
  surface: "trail",
  elevation_m: 312,
  started_at_iso: new Date(NOW - 2 * DAY).toISOString(),
  avg_pace_per_km: "5:43",
  confidence: "high",
  summary: "8.2 km trail run, 47 min, 312 m gain",
};

describe("normalizeParsedActivity — type whitelist clamp", () => {
  it("passes every whitelisted type through", () => {
    for (const type of ["padel", "run", "walk", "bike", "swim", "football", "hike", "other"]) {
      expect(normalizeParsedActivity({ ...RAW, type }, NOW).type).toBe(type);
    }
  });

  it("clamps unknown / non-string types to 'other'", () => {
    for (const type of ["yoga", "Run", "RIDE", "", 1, null, undefined, {}, true]) {
      expect(normalizeParsedActivity({ ...RAW, type }, NOW).type, String(type)).toBe("other");
    }
  });
});

describe("normalizeParsedActivity — distance coercion", () => {
  it("keeps a positive finite distance", () => {
    expect(normalizeParsedActivity({ ...RAW, distance_km: 5.2 }, NOW).distance_km).toBe(5.2);
  });

  it("nulls zero, negative, non-finite, and non-number distance", () => {
    for (const d of [0, -1, -0.5, NaN, Infinity, "5", null, undefined, {}]) {
      expect(
        normalizeParsedActivity({ ...RAW, distance_km: d }, NOW).distance_km,
        String(d)
      ).toBeNull();
    }
  });
});

describe("normalizeParsedActivity — duration coercion", () => {
  it("keeps a positive integer", () => {
    expect(normalizeParsedActivity({ ...RAW, duration_min: 47 }, NOW).duration_min).toBe(47);
  });

  it("rounds a fractional positive duration", () => {
    expect(normalizeParsedActivity({ ...RAW, duration_min: 46.6 }, NOW).duration_min).toBe(47);
    expect(normalizeParsedActivity({ ...RAW, duration_min: 0.4 }, NOW).duration_min).toBe(null); // rounds to 0 → null
  });

  it("nulls zero, negative, non-finite, and non-number duration", () => {
    for (const d of [0, -1, -90, NaN, Infinity, "47", null, undefined, {}]) {
      expect(
        normalizeParsedActivity({ ...RAW, duration_min: d }, NOW).duration_min,
        String(d)
      ).toBeNull();
    }
  });
});

describe("normalizeParsedActivity — surface clamp", () => {
  it("keeps a whitelisted surface", () => {
    for (const s of ["road", "trail", "track", "treadmill", "gravel", "indoor", "mixed"]) {
      expect(normalizeParsedActivity({ ...RAW, surface: s }, NOW).surface).toBe(s);
    }
  });

  it("nulls unknown / non-string surface", () => {
    for (const s of ["pavement", "Trail", "", 1, null, undefined, {}]) {
      expect(normalizeParsedActivity({ ...RAW, surface: s }, NOW).surface, String(s)).toBeNull();
    }
  });
});

describe("normalizeParsedActivity — elevation bounds", () => {
  it("keeps an integer within [0, 30000]", () => {
    for (const e of [0, 312, 30000]) {
      expect(normalizeParsedActivity({ ...RAW, elevation_m: e }, NOW).elevation_m).toBe(e);
    }
  });

  it("rounds a fractional elevation (feet→m conversions)", () => {
    expect(normalizeParsedActivity({ ...RAW, elevation_m: 312.4 }, NOW).elevation_m).toBe(312);
  });

  it("nulls negative, over-max, non-finite, and non-number elevation", () => {
    for (const e of [-1, -100, 30001, 50000, NaN, Infinity, "100", null, undefined, {}]) {
      expect(
        normalizeParsedActivity({ ...RAW, elevation_m: e }, NOW).elevation_m,
        String(e)
      ).toBeNull();
    }
  });
});

describe("normalizeParsedActivity — started_at_iso → ms", () => {
  it("converts a valid past ISO datetime to its epoch ms", () => {
    const iso = new Date(NOW - 2 * DAY).toISOString();
    expect(normalizeParsedActivity({ ...RAW, started_at_iso: iso }, NOW).started_at).toBe(
      Date.parse(iso)
    );
  });

  it("accepts the boundaries (now, exactly a year ago)", () => {
    const nowIso = new Date(NOW).toISOString();
    expect(normalizeParsedActivity({ ...RAW, started_at_iso: nowIso }, NOW).started_at).toBe(NOW);
    const yearAgo = new Date(NOW - 365 * DAY).toISOString();
    expect(normalizeParsedActivity({ ...RAW, started_at_iso: yearAgo }, NOW).started_at).toBe(
      Date.parse(yearAgo)
    );
  });

  it("nulls a future timestamp", () => {
    const future = new Date(NOW + DAY).toISOString();
    expect(normalizeParsedActivity({ ...RAW, started_at_iso: future }, NOW).started_at).toBeNull();
  });

  it("nulls a timestamp older than a year", () => {
    const old = new Date(NOW - 366 * DAY).toISOString();
    expect(normalizeParsedActivity({ ...RAW, started_at_iso: old }, NOW).started_at).toBeNull();
  });

  it("nulls garbage strings, null, and non-strings", () => {
    for (const s of ["not a date", "", "tomorrow", null, undefined, 123, {}]) {
      expect(
        normalizeParsedActivity({ ...RAW, started_at_iso: s }, NOW).started_at,
        String(s)
      ).toBeNull();
    }
  });
});

describe("normalizeParsedActivity — avg_pace_per_km", () => {
  it("keeps a short non-empty pace string", () => {
    expect(normalizeParsedActivity({ ...RAW, avg_pace_per_km: "5:43" }, NOW).avg_pace_per_km).toBe(
      "5:43"
    );
  });

  it("nulls blank and non-string pace", () => {
    for (const p of ["", "   ", null, undefined, 343, {}]) {
      expect(
        normalizeParsedActivity({ ...RAW, avg_pace_per_km: p }, NOW).avg_pace_per_km,
        String(p)
      ).toBeNull();
    }
  });
});

describe("normalizeParsedActivity — confidence default", () => {
  it("keeps a valid confidence level", () => {
    for (const c of ["low", "medium", "high"]) {
      expect(normalizeParsedActivity({ ...RAW, confidence: c }, NOW).confidence).toBe(c);
    }
  });

  it("defaults unknown / non-string confidence to 'low'", () => {
    for (const c of ["HIGH", "very", "", null, undefined, 1, {}]) {
      expect(
        normalizeParsedActivity({ ...RAW, confidence: c }, NOW).confidence,
        String(c)
      ).toBe("low");
    }
  });
});

describe("normalizeParsedActivity — summary default", () => {
  it("keeps a string summary", () => {
    expect(normalizeParsedActivity({ ...RAW, summary: "5 km run" }, NOW).summary).toBe("5 km run");
  });

  it("defaults non-string summary to ''", () => {
    for (const s of [null, undefined, 1, {}, true]) {
      expect(normalizeParsedActivity({ ...RAW, summary: s }, NOW).summary, String(s)).toBe("");
    }
  });
});

describe("normalizeParsedActivity — never throws on bad input", () => {
  it("coerces an empty object to a fully-null/other result", () => {
    const r = normalizeParsedActivity({}, NOW);
    expect(r).toEqual({
      type: "other",
      distance_km: null,
      duration_min: null,
      surface: null,
      elevation_m: null,
      started_at: null,
      avg_pace_per_km: null,
      confidence: "low",
      summary: "",
    });
  });

  it("coerces null / non-object raw to the same null result", () => {
    for (const bad of [null, undefined, 42, "x", true, []]) {
      const r = normalizeParsedActivity(bad, NOW);
      expect(r.type, String(bad)).toBe("other");
      expect(r.confidence).toBe("low");
      expect(r.distance_km).toBeNull();
      expect(r.started_at).toBeNull();
    }
  });
});
