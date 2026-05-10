import { describe, it, expect } from "vitest";
import { buildHeadline } from "../rolling-headline";
import type { DayAggregate } from "../types";

const targets = { sat_fat_g: 18, soluble_fiber_g: 10 };

function mkDay(
  date: string,
  partial: Partial<Omit<DayAggregate, "date">>
): DayAggregate {
  return {
    date,
    meal_count: 1,
    plant_pct: 0,
    sat_fat_g: 0,
    soluble_fiber_g: 0,
    calories: 0,
    protein_g: 0,
    ...partial,
  };
}

function loggedDays(count: number, partial: Partial<Omit<DayAggregate, "date">>): DayAggregate[] {
  return Array.from({ length: count }, (_, i) =>
    mkDay(`2026-05-${String(i + 1).padStart(2, "0")}`, partial)
  );
}

describe("buildHeadline", () => {
  it("returns null with fewer than 3 logged days", () => {
    const aggs = loggedDays(2, { plant_pct: 80, soluble_fiber_g: 12 });
    expect(buildHeadline(aggs, targets)).toBeNull();
  });

  it("ignores days with meal_count = 0 when counting 'logged'", () => {
    const aggs = [
      ...loggedDays(2, { plant_pct: 80, soluble_fiber_g: 12 }),
      mkDay("2026-05-03", { meal_count: 0 }),
      mkDay("2026-05-04", { meal_count: 0 }),
    ];
    expect(buildHeadline(aggs, targets)).toBeNull();
  });

  it("celebrates fiber consistency when ≥70% of days hit target", () => {
    const aggs = loggedDays(10, { plant_pct: 80, soluble_fiber_g: 12 });
    const out = buildHeadline(aggs, targets)!;
    expect(out).toMatch(/fiber on track most days/);
    expect(out).toMatch(/Last 10 logged days/);
  });

  it("notes 'fiber close to target' when avg ≥ 70% but consistency < 70%", () => {
    // 10 days, all at 8g (80% of 10g target), but no day actually hits target
    const aggs = loggedDays(10, { plant_pct: 80, soluble_fiber_g: 8 });
    const out = buildHeadline(aggs, targets)!;
    expect(out).toMatch(/fiber close to target/);
    expect(out).not.toMatch(/fiber on track/);
  });

  it("nudges 'low fiber' with concrete suggestions when avg < 40% target", () => {
    const aggs = loggedDays(5, { plant_pct: 80, soluble_fiber_g: 2 });
    const out = buildHeadline(aggs, targets)!;
    expect(out).toMatch(/fiber low/);
    expect(out).toMatch(/oats, beans, psyllium/);
  });

  it("uses plant_pct buckets: ≥80 mostly plant, ≥60 plant-leaning, ≥40 mixed, else animal-led", () => {
    const cases: [number, string][] = [
      [85, "mostly plant-based"],
      [70, "plant-leaning"],
      [50, "mixed plates"],
      [20, "mostly animal-based"],
    ];
    for (const [plantPct, expected] of cases) {
      const aggs = loggedDays(3, { plant_pct: plantPct, soluble_fiber_g: 10 });
      const out = buildHeadline(aggs, targets)!;
      expect(out).toMatch(new RegExp(expected));
    }
  });

  it("flags sat fat trending DOWN with a ≥15% delta vs prior window", () => {
    // 14 days at 20g, then 14 days at 14g (30% drop)
    const aggs: DayAggregate[] = [
      ...loggedDays(14, { plant_pct: 60, soluble_fiber_g: 10, sat_fat_g: 20 }).map(
        (d, i) => ({ ...d, date: `2026-04-${String(i + 1).padStart(2, "0")}` })
      ),
      ...loggedDays(14, { plant_pct: 60, soluble_fiber_g: 10, sat_fat_g: 14 }).map(
        (d, i) => ({ ...d, date: `2026-05-${String(i + 1).padStart(2, "0")}` })
      ),
    ];
    const out = buildHeadline(aggs, targets)!;
    expect(out).toMatch(/sat fat trending down/);
  });

  it("flags sat fat ticking UP with a ≥15% rise vs prior window", () => {
    const aggs: DayAggregate[] = [
      ...loggedDays(14, { plant_pct: 60, soluble_fiber_g: 10, sat_fat_g: 12 }).map(
        (d, i) => ({ ...d, date: `2026-04-${String(i + 1).padStart(2, "0")}` })
      ),
      ...loggedDays(14, { plant_pct: 60, soluble_fiber_g: 10, sat_fat_g: 17 }).map(
        (d, i) => ({ ...d, date: `2026-05-${String(i + 1).padStart(2, "0")}` })
      ),
    ];
    const out = buildHeadline(aggs, targets)!;
    expect(out).toMatch(/sat fat ticking up/);
  });

  it("does NOT mention sat fat when the change is < 15% (noise floor)", () => {
    const aggs: DayAggregate[] = [
      ...loggedDays(14, { plant_pct: 60, soluble_fiber_g: 10, sat_fat_g: 14 }).map(
        (d, i) => ({ ...d, date: `2026-04-${String(i + 1).padStart(2, "0")}` })
      ),
      ...loggedDays(14, { plant_pct: 60, soluble_fiber_g: 10, sat_fat_g: 14.5 }).map(
        (d, i) => ({ ...d, date: `2026-05-${String(i + 1).padStart(2, "0")}` })
      ),
    ];
    const out = buildHeadline(aggs, targets)!;
    expect(out).not.toMatch(/sat fat/);
  });

  it("without prior 14-day window, only flags sat fat if ≥130% of target", () => {
    // 5 logged days at 25g (sat target 18, threshold = 1.3 * 18 = 23.4)
    const aggs = loggedDays(5, { plant_pct: 60, soluble_fiber_g: 10, sat_fat_g: 25 });
    const out = buildHeadline(aggs, targets)!;
    expect(out).toMatch(/sat fat above target/);
  });

  it("without prior window, stays quiet on sat fat just over target", () => {
    // 19g — 5% over target, well below the 130% noise floor
    const aggs = loggedDays(5, { plant_pct: 60, soluble_fiber_g: 10, sat_fat_g: 19 });
    const out = buildHeadline(aggs, targets)!;
    expect(out).not.toMatch(/sat fat/);
  });
});
