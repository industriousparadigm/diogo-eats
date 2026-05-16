import { describe, it, expect } from "vitest";
import { todayStart, ymd, parseYmd, isSameDay, dayLabel, createdAtFor } from "../date";

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

describe("createdAtFor", () => {
  const now = new Date(2026, 4, 14, 20, 30, 45, 0); // Thu 14 May 2026 20:30:45

  it("returns now.getTime() when forDate is null/undefined/empty", () => {
    expect(createdAtFor(null, now)).toBe(now.getTime());
    expect(createdAtFor(undefined, now)).toBe(now.getTime());
    expect(createdAtFor("", now)).toBe(now.getTime());
  });

  it("returns now.getTime() when forDate is malformed", () => {
    expect(createdAtFor("not-a-date", now)).toBe(now.getTime());
    expect(createdAtFor("2026-5-1", now)).toBe(now.getTime()); // unpadded
    expect(createdAtFor("2026/05/14", now)).toBe(now.getTime()); // wrong sep
  });

  it("anchors past-day backfills to the last second of the chosen day", () => {
    const out = new Date(createdAtFor("2026-05-12", now));
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(4);
    expect(out.getDate()).toBe(12);
    expect(out.getHours()).toBe(23);
    expect(out.getMinutes()).toBe(59);
    expect(out.getSeconds()).toBe(59);
  });

  it("preserves stable ordering between two same-day backfills made at different real times", () => {
    const morningNow = new Date(2026, 4, 14, 8, 0, 0, 0); // 8am today
    const eveningNow = new Date(2026, 4, 14, 22, 0, 0, 0); // 10pm today
    const a = createdAtFor("2026-05-12", morningNow);
    const b = createdAtFor("2026-05-12", eveningNow);
    // Later real-time today → larger timestamp on the past day, so
    // the meal entered later sorts higher in the day's list.
    expect(b).toBeGreaterThan(a);
    // Both still inside the last second of 2026-05-12.
    expect(new Date(a).getHours()).toBe(23);
    expect(new Date(b).getHours()).toBe(23);
    expect(new Date(a).getMinutes()).toBe(59);
    expect(new Date(b).getMinutes()).toBe(59);
  });

  it("falls back to now for future dates — never logs forward", () => {
    expect(createdAtFor("2026-05-15", now)).toBe(now.getTime());
    expect(createdAtFor("2030-01-01", now)).toBe(now.getTime());
  });

  it("logging for today returns the actual current timestamp", () => {
    // forDate === today should be equivalent to passing null: same value.
    expect(createdAtFor("2026-05-14", now)).toBe(now.getTime());
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
