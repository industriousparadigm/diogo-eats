// Unit tests for lib/format.ts — pure display-formatting functions.

import {
  fmt,
  fmtCal,
  fmtPlant,
  itemsSummary,
  fmtTime,
  fmtDayLabel,
  todayYmd,
  totalGrams,
} from "../lib/format";

describe("fmt", () => {
  it("rounds to 1 decimal by default", () => {
    expect(fmt(12.567)).toBe("12.6");
  });

  it("trims trailing zeros", () => {
    expect(fmt(12.0)).toBe("12");
    expect(fmt(12.10)).toBe("12.1");
  });

  it("handles 0 decimals", () => {
    expect(fmt(12.7, 0)).toBe("13");
  });

  it("handles non-finite values", () => {
    expect(fmt(NaN)).toBe("0");
    expect(fmt(Infinity)).toBe("0");
  });
});

describe("fmtCal", () => {
  it("returns whole number string", () => {
    expect(fmtCal(1842.7)).toBe("1843");
    expect(fmtCal(0)).toBe("0");
    expect(fmtCal(2000)).toBe("2000");
  });
});

describe("fmtPlant", () => {
  it("rounds and appends percent sign", () => {
    expect(fmtPlant(73.6)).toBe("74%");
    expect(fmtPlant(0)).toBe("0%");
    expect(fmtPlant(100)).toBe("100%");
  });
});

describe("itemsSummary", () => {
  const items = JSON.stringify([
    { name: "Oatmeal", grams: 200 },
    { name: "Banana", grams: 120 },
    { name: "Chia seeds", grams: 15 },
    { name: "Almond milk", grams: 100 },
  ]);

  it("shows top 3 items sorted by grams", () => {
    expect(itemsSummary(items)).toBe("Oatmeal, Banana, Almond milk +1 more");
  });

  it("shows all items when 3 or fewer", () => {
    const few = JSON.stringify([
      { name: "Egg", grams: 50 },
      { name: "Toast", grams: 40 },
    ]);
    expect(itemsSummary(few)).toBe("Egg, Toast");
  });

  it("returns empty string for empty array", () => {
    expect(itemsSummary("[]")).toBe("");
  });

  it("returns empty string for invalid JSON", () => {
    expect(itemsSummary("not-json")).toBe("");
  });

  it("handles exactly 3 items with no +N", () => {
    const three = JSON.stringify([
      { name: "A", grams: 100 },
      { name: "B", grams: 90 },
      { name: "C", grams: 80 },
    ]);
    expect(itemsSummary(three)).toBe("A, B, C");
  });
});

describe("fmtTime", () => {
  it("formats epoch ms as HH:MM", () => {
    // 2026-06-10 08:30 UTC. We test the structure, not a specific local time,
    // since tests run in the machine's timezone.
    const ms = new Date(2026, 5, 10, 8, 30).getTime(); // local time
    const result = fmtTime(ms);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
    expect(result).toBe("08:30");
  });

  it("zero-pads single-digit hours and minutes", () => {
    const ms = new Date(2026, 5, 10, 9, 5).getTime();
    expect(fmtTime(ms)).toBe("09:05");
  });
});

describe("fmtDayLabel", () => {
  it("formats a date string as a readable label", () => {
    const result = fmtDayLabel("2026-06-10");
    // Should include the day name and date in some form.
    expect(result).toContain("10");
    expect(result).toContain("Jun");
  });
});

describe("todayYmd", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayYmd()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches today's date components", () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
    expect(todayYmd()).toBe(expected);
  });
});

describe("totalGrams", () => {
  it("sums grams across items", () => {
    const items = JSON.stringify([
      { name: "A", grams: 100 },
      { name: "B", grams: 50 },
    ]);
    expect(totalGrams(items)).toBe(150);
  });

  it("returns 0 for empty array", () => {
    expect(totalGrams("[]")).toBe(0);
  });

  it("returns 0 for invalid JSON", () => {
    expect(totalGrams("bad")).toBe(0);
  });
});
