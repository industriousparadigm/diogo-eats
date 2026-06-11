// Component tests for the DayTotalsStrip (wave-2 item 3) — semantic color
// restored on the day's headline numbers, targets INJECTED (never hardcoded):
//   - sat fat amber when the DAY is over target;
//   - fiber lime when at/above target;
//   - plant lime always.
// Restraint holds: amber is as loud as food gets — never red.

import React from "react";
import { render } from "@testing-library/react-native";
import { DayTotalsStrip } from "../components/DayTotalsStrip";
import type { DayTotals, Targets } from "../lib/types";
import { palette } from "../lib/theme";

const TARGETS: Targets = { sat_fat_g: 18, soluble_fiber_g: 10, calories: 2000, protein_g: 90 };

function totals(overrides: Partial<DayTotals> = {}): DayTotals {
  return {
    calories: 1800,
    protein_g: 85,
    sat_fat_g: 9,
    soluble_fiber_g: 12,
    plant_pct: 75,
    ...overrides,
  };
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce(
      (acc: Record<string, unknown>, s) => ({ ...acc, ...flattenStyle(s) }),
      {}
    );
  }
  return (style as Record<string, unknown>) ?? {};
}

function colorOf(node: { props: { style?: unknown } }) {
  return flattenStyle(node.props.style).color;
}

describe("DayTotalsStrip — semantic color (item 3)", () => {
  it("plant is always the food lime", async () => {
    const { getByText } = await render(
      <DayTotalsStrip totals={totals({ plant_pct: 20 })} targets={TARGETS} />
    );
    expect(colorOf(getByText("20%"))).toBe(palette.food.accent);
  });

  it("fiber goes lime when at/above target, neutral below", async () => {
    const over = await render(
      <DayTotalsStrip totals={totals({ soluble_fiber_g: 12 })} targets={TARGETS} />
    );
    expect(colorOf(over.getByText("12g"))).toBe(palette.food.accent);

    const under = await render(
      <DayTotalsStrip totals={totals({ soluble_fiber_g: 6 })} targets={TARGETS} />
    );
    expect(colorOf(under.getByText("6g"))).not.toBe(palette.food.accent);
  });

  it("sat fat goes amber only when the day is over target — never red", async () => {
    const over = await render(
      <DayTotalsStrip totals={totals({ sat_fat_g: 22 })} targets={TARGETS} />
    );
    const overNode = over.getByText("22g");
    expect(colorOf(overNode)).toBe(palette.warn);
    expect(colorOf(overNode)).not.toBe(palette.danger);
    expect(colorOf(overNode)).not.toBe(palette.dangerStrong);

    const under = await render(
      <DayTotalsStrip totals={totals({ sat_fat_g: 9 })} targets={TARGETS} />
    );
    expect(colorOf(under.getByText("9g"))).not.toBe(palette.warn);
  });

  it("honors an injected (non-default) target rather than a hardcoded one", async () => {
    // A tighter sat-fat target trips amber on a day the default would not.
    const tight = await render(
      <DayTotalsStrip
        totals={totals({ sat_fat_g: 14 })}
        targets={{ ...TARGETS, sat_fat_g: 12 }}
      />
    );
    expect(colorOf(tight.getByText("14g"))).toBe(palette.warn);

    const loose = await render(
      <DayTotalsStrip
        totals={totals({ sat_fat_g: 14 })}
        targets={{ ...TARGETS, sat_fat_g: 25 }}
      />
    );
    expect(colorOf(loose.getByText("14g"))).not.toBe(palette.warn);
  });
});
