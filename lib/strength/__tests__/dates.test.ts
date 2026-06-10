import { describe, it, expect } from "vitest";
import { diffDaysYmd, monthNameOfYmd, ordinal, weekStartYmd } from "../dates";

describe("weekStartYmd (Monday start)", () => {
  it("a Wednesday maps to its Monday", () => {
    expect(weekStartYmd("2026-06-10")).toBe("2026-06-08"); // Wed → Mon
  });
  it("Monday maps to itself", () => {
    expect(weekStartYmd("2026-06-08")).toBe("2026-06-08");
  });
  it("Sunday belongs to the PRECEDING Monday's week", () => {
    expect(weekStartYmd("2026-06-14")).toBe("2026-06-08");
  });
  it("the next Monday starts a new week", () => {
    expect(weekStartYmd("2026-06-15")).toBe("2026-06-15");
  });
  it("crosses month boundaries", () => {
    expect(weekStartYmd("2026-07-01")).toBe("2026-06-29"); // Wed 1 Jul → Mon 29 Jun
  });
  it("crosses year boundaries", () => {
    expect(weekStartYmd("2026-01-01")).toBe("2025-12-29"); // Thu 1 Jan → Mon 29 Dec
  });
});

describe("diffDaysYmd", () => {
  it("same day is 0", () => {
    expect(diffDaysYmd("2026-06-10", "2026-06-10")).toBe(0);
  });
  it("counts forward across a month boundary", () => {
    expect(diffDaysYmd("2026-06-28", "2026-07-02")).toBe(4);
  });
  it("is negative when b precedes a", () => {
    expect(diffDaysYmd("2026-06-10", "2026-06-07")).toBe(-3);
  });
});

describe("monthNameOfYmd", () => {
  it("June", () => {
    expect(monthNameOfYmd("2026-06-10")).toBe("June");
  });
  it("December", () => {
    expect(monthNameOfYmd("2026-12-01")).toBe("December");
  });
});

describe("ordinal", () => {
  it("handles 1st/2nd/3rd", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
  });
  it("11th-13th stay th", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
  });
  it("21st/22nd/23rd flip back", () => {
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
    expect(ordinal(111)).toBe("111th");
  });
});
