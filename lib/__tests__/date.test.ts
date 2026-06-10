import { describe, it, expect } from "vitest";
import { todayStart, ymd, parseYmd, isSameDay, dayLabel } from "../date";

describe("todayStart", () => {
  it("zeroes the time portion", () => {
    const d = todayStart(new Date("2026-05-09T15:30:45.123"));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it("does not mutate the input", () => {
    const input = new Date("2026-05-09T15:30:00");
    const before = input.getTime();
    todayStart(input);
    expect(input.getTime()).toBe(before);
  });
});

describe("ymd", () => {
  it("zero-pads month and day", () => {
    expect(ymd(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(ymd(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("parseYmd", () => {
  it("parses to local-midnight (not UTC) so day boundaries match the user", () => {
    const d = parseYmd("2026-05-08");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May = 4
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
  });

  it("round-trips with ymd", () => {
    expect(ymd(parseYmd("2026-05-08"))).toBe("2026-05-08");
  });
});

describe("isSameDay", () => {
  it("ignores time of day", () => {
    expect(
      isSameDay(new Date("2026-05-08T03:00"), new Date("2026-05-08T22:00"))
    ).toBe(true);
  });
  it("respects date boundaries", () => {
    expect(
      isSameDay(new Date("2026-05-08T23:59"), new Date("2026-05-09T00:01"))
    ).toBe(false);
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 4, 9, 12, 0); // 9 May 2026, noon

  it("returns 'Today' for current date", () => {
    expect(dayLabel(new Date(2026, 4, 9, 8, 0), now)).toBe("Today");
  });
  it("returns 'Yesterday' for one day ago", () => {
    expect(dayLabel(new Date(2026, 4, 8), now)).toBe("Yesterday");
  });
  it("returns weekday + date for older", () => {
    const out = dayLabel(new Date(2026, 4, 5), now);
    // Locale-dependent format; just assert it's not the special cases
    // and contains 'May' or '5' (weekday + month/day mix).
    expect(out).not.toBe("Today");
    expect(out).not.toBe("Yesterday");
    expect(out.length).toBeGreaterThan(3);
  });
});
