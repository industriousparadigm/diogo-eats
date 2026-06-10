import { describe, it, expect } from "vitest";
import {
  APP_TZ,
  addDaysYmd,
  createdAtForTz,
  todayYmd,
  tzDayBounds,
  tzDayStart,
  tzYmd,
} from "../tz";

// Europe/Lisbon: UTC+0 in winter (WET), UTC+1 in summer (WEST).
// DST 2026: spring forward 29 Mar, fall back 25 Oct.

describe("tzYmd", () => {
  it("late-evening UTC in summer lands on the NEXT Lisbon day", () => {
    // 2026-06-09 23:30 UTC = 2026-06-10 00:30 Lisbon (UTC+1)
    const ts = Date.UTC(2026, 5, 9, 23, 30);
    expect(tzYmd(ts)).toBe("2026-06-10");
  });

  it("same instant in winter stays on the same day (UTC+0)", () => {
    const ts = Date.UTC(2026, 0, 9, 23, 30);
    expect(tzYmd(ts)).toBe("2026-01-09");
  });

  it("respects an explicit timezone parameter", () => {
    const ts = Date.UTC(2026, 5, 9, 23, 30);
    expect(tzYmd(ts, "UTC")).toBe("2026-06-09");
    expect(tzYmd(ts, "Asia/Tokyo")).toBe("2026-06-10");
  });
});

describe("tzDayStart", () => {
  it("summer: Lisbon midnight is 23:00 UTC the previous day", () => {
    expect(tzDayStart("2026-06-10")).toBe(Date.UTC(2026, 5, 9, 23, 0));
  });

  it("winter: Lisbon midnight equals UTC midnight", () => {
    expect(tzDayStart("2026-01-10")).toBe(Date.UTC(2026, 0, 10, 0, 0));
  });
});

describe("tzDayBounds", () => {
  it("a normal day spans exactly 24h", () => {
    const [start, end] = tzDayBounds("2026-06-10");
    expect(end - start).toBe(24 * 3600 * 1000);
  });

  it("spring-forward day (29 Mar 2026) spans 23h", () => {
    const [start, end] = tzDayBounds("2026-03-29");
    expect(end - start).toBe(23 * 3600 * 1000);
  });

  it("fall-back day (25 Oct 2026) spans 25h", () => {
    const [start, end] = tzDayBounds("2026-10-25");
    expect(end - start).toBe(25 * 3600 * 1000);
  });

  it("bounds are half-open and contiguous: end of day N = start of day N+1", () => {
    const [, end] = tzDayBounds("2026-06-10");
    const [startNext] = tzDayBounds("2026-06-11");
    expect(end).toBe(startNext);
  });

  it("a timestamp just before Lisbon midnight belongs to the earlier day", () => {
    const ts = Date.UTC(2026, 5, 9, 22, 59); // 23:59 Lisbon on 9 Jun
    const [start, end] = tzDayBounds("2026-06-09");
    expect(ts).toBeGreaterThanOrEqual(start);
    expect(ts).toBeLessThan(end);
  });
});

describe("createdAtForTz", () => {
  // Server runs UTC. "Now" = 2026-06-10 10:00 UTC = 11:00 Lisbon.
  const now = Date.UTC(2026, 5, 10, 10, 0);

  it("missing / malformed / today / future all return now", () => {
    expect(createdAtForTz(null, APP_TZ, now)).toBe(now);
    expect(createdAtForTz("nonsense", APP_TZ, now)).toBe(now);
    expect(createdAtForTz("2026-06-10", APP_TZ, now)).toBe(now);
    expect(createdAtForTz("2026-07-01", APP_TZ, now)).toBe(now);
  });

  it("backfill lands inside the LISBON target day, not the UTC one", () => {
    const ts = createdAtForTz("2026-06-08", APP_TZ, now);
    const [start, end] = tzDayBounds("2026-06-08");
    expect(ts).toBeGreaterThanOrEqual(start);
    expect(ts).toBeLessThan(end);
    // The old UTC-local code anchored to 23:59:59 UTC = 00:59 Lisbon
    // on the 9th — the wrong day. The fix anchors to Lisbon 23:59:59.
    expect(tzYmd(ts)).toBe("2026-06-08");
  });

  it("backfill sits in the last full second of the day", () => {
    const ts = createdAtForTz("2026-06-08", APP_TZ, now);
    const [, end] = tzDayBounds("2026-06-08");
    expect(end - ts).toBeLessThanOrEqual(1000);
    expect(end - ts).toBeGreaterThan(0);
  });

  it("two backfills for the same day later in real time order monotonically", () => {
    const t1 = createdAtForTz("2026-06-08", APP_TZ, now);
    const t2 = createdAtForTz("2026-06-08", APP_TZ, now + 3 * 3600 * 1000);
    expect(t2).toBeGreaterThan(t1);
  });

  it("edge of today: just after Lisbon midnight, yesterday is backfillable", () => {
    // 2026-06-09 23:30 UTC = 2026-06-10 00:30 Lisbon → today is the 10th
    const lateNow = Date.UTC(2026, 5, 9, 23, 30);
    const ts = createdAtForTz("2026-06-09", APP_TZ, lateNow);
    expect(tzYmd(ts)).toBe("2026-06-09");
    expect(ts).toBeLessThan(lateNow);
  });
});

describe("todayYmd / addDaysYmd", () => {
  it("todayYmd accepts an explicit now", () => {
    expect(todayYmd(APP_TZ, Date.UTC(2026, 5, 9, 23, 30))).toBe("2026-06-10");
  });

  it("addDaysYmd crosses month and year boundaries", () => {
    expect(addDaysYmd("2026-06-10", -83)).toBe("2026-03-19");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
  });
});
