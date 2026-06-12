// Movement quick-log helpers — validation mirroring the server rules
// (duration int 1..1440, effort whitelist, distance > 0, started_at not
// future / not older than 1yr) + display formatting + the day/hour steppers.

import {
  validateQuickLog,
  fmtEffort,
  fmtDistance,
  fmtActivitySubtitle,
  fmtDurationValue,
  stepDays,
  stepHours,
  daysBack,
  fmtDaysBack,
  fmtClock,
  ONE_YEAR_MS,
  type QuickLogDraft,
} from "../lib/movementLog";

const NOW = new Date(2026, 5, 12, 14, 0).getTime(); // 12 Jun 2026 14:00 local

function draft(overrides: Partial<QuickLogDraft> = {}): QuickLogDraft {
  return {
    type: "padel",
    durationText: "60",
    effort: null,
    label: "",
    note: "",
    distanceText: "",
    startedAt: NOW,
    ...overrides,
  };
}

describe("validateQuickLog", () => {
  it("accepts a clean padel log and normalizes to a CreateActivityInput", () => {
    const r = validateQuickLog(
      draft({ effort: "light", label: "class" }),
      NOW,
      false
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input).toEqual({
        type: "padel",
        duration_min: 60,
        started_at: NOW,
        effort: "light",
        distance_km: null,
        label: "class",
        note: null,
      });
    }
  });

  it("requires a type", () => {
    const r = validateQuickLog(draft({ type: "" }), NOW, false);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/type/) });
  });

  it("rejects a non-integer duration", () => {
    expect(validateQuickLog(draft({ durationText: "60.5" }), NOW, false)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/whole number/),
    });
    expect(validateQuickLog(draft({ durationText: "abc" }), NOW, false)).toMatchObject({
      ok: false,
    });
  });

  it("enforces the 1..1440 duration bounds", () => {
    expect(validateQuickLog(draft({ durationText: "0" }), NOW, false)).toMatchObject({ ok: false });
    expect(validateQuickLog(draft({ durationText: "1441" }), NOW, false)).toMatchObject({ ok: false });
    expect(validateQuickLog(draft({ durationText: "1" }), NOW, false)).toMatchObject({ ok: true });
    expect(validateQuickLog(draft({ durationText: "1440" }), NOW, false)).toMatchObject({ ok: true });
  });

  it("rejects an effort outside the whitelist", () => {
    const r = validateQuickLog(
      draft({ effort: "brutal" as unknown as QuickLogDraft["effort"] }),
      NOW,
      false
    );
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/light, moderate, or hard/) });
  });

  it("rejects a future started_at", () => {
    expect(
      validateQuickLog(draft({ startedAt: NOW + 3_600_000 }), NOW, false)
    ).toMatchObject({ ok: false, error: expect.stringMatching(/future/) });
  });

  it("rejects a started_at older than a year", () => {
    expect(
      validateQuickLog(draft({ startedAt: NOW - ONE_YEAR_MS - 1000 }), NOW, false)
    ).toMatchObject({ ok: false, error: expect.stringMatching(/year/) });
  });

  it("includes a positive distance only when distance is enabled", () => {
    // Disabled type ignores distance text entirely.
    const off = validateQuickLog(draft({ type: "padel", distanceText: "5.2" }), NOW, false);
    expect(off.ok && off.input.distance_km).toBe(null);
    // Enabled type carries it through.
    const on = validateQuickLog(draft({ type: "run", distanceText: "5.2" }), NOW, true);
    expect(on.ok && on.input.distance_km).toBe(5.2);
  });

  it("rejects a non-positive distance when enabled + provided", () => {
    expect(validateQuickLog(draft({ type: "run", distanceText: "0" }), NOW, true)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/greater than 0/),
    });
    expect(validateQuickLog(draft({ type: "run", distanceText: "-3" }), NOW, true)).toMatchObject({
      ok: false,
    });
  });

  it("leaves distance null when enabled but blank", () => {
    const r = validateQuickLog(draft({ type: "run", distanceText: "" }), NOW, true);
    expect(r.ok && r.input.distance_km).toBe(null);
  });

  it("clears empty label/note to null", () => {
    const r = validateQuickLog(draft({ label: "   ", note: "" }), NOW, false);
    expect(r.ok && r.input.label).toBe(null);
    expect(r.ok && r.input.note).toBe(null);
  });
});

describe("display formatting", () => {
  it("formats the duration value as bare digits", () => {
    expect(fmtDurationValue(90)).toBe("90");
  });
  it("formats effort or null", () => {
    expect(fmtEffort("light")).toBe("felt: light");
    expect(fmtEffort(null)).toBeNull();
  });
  it("formats distance, trimming trailing zeros, or null", () => {
    expect(fmtDistance(5)).toBe("5 km");
    expect(fmtDistance(5.2)).toBe("5.2 km");
    expect(fmtDistance(5.2)).not.toContain("5.20");
    expect(fmtDistance(null)).toBeNull();
  });
  it("builds the card subtitle with + without a label", () => {
    expect(fmtActivitySubtitle("Padel", "class")).toBe("padel · class");
    expect(fmtActivitySubtitle("Run", null)).toBe("run");
    expect(fmtActivitySubtitle("Walk", "  ")).toBe("walk");
  });
});

describe("steppers", () => {
  it("steps whole local days, preserving the wall-clock hour", () => {
    const back = stepDays(NOW, -1); // 11 Jun 14:00
    expect(new Date(back).getDate()).toBe(11);
    expect(new Date(back).getHours()).toBe(14);
  });

  it("steps whole hours, normalizing day overflow", () => {
    const lateNight = new Date(2026, 5, 12, 23, 30).getTime();
    const next = stepHours(lateNight, 1); // → 13 Jun 00:30
    expect(new Date(next).getDate()).toBe(13);
    expect(new Date(next).getHours()).toBe(0);
  });

  it("daysBack measures whole local days from now", () => {
    expect(daysBack(NOW, NOW)).toBe(0);
    expect(daysBack(stepDays(NOW, -1), NOW)).toBe(1);
    expect(daysBack(stepDays(NOW, -3), NOW)).toBe(3);
  });

  it("labels the day-back stepper in plain language", () => {
    expect(fmtDaysBack(NOW, NOW)).toBe("today");
    expect(fmtDaysBack(stepDays(NOW, -1), NOW)).toBe("yesterday");
    expect(fmtDaysBack(stepDays(NOW, -4), NOW)).toBe("4 days ago");
  });

  it("formats the clock as HH:MM", () => {
    expect(fmtClock(new Date(2026, 5, 12, 9, 5).getTime())).toBe("09:05");
  });
});
