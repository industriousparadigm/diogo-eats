// Component tests for TrendChart — the trend-range bug fix. The chart must
// plot the X-RANGE OF THE WHOLE WINDOW the parent passes in (not a fixed
// ~7-day tail), keep the 7d-avg smoothing on per-day ranges, and switch to
// weekly decimation on the year range.

import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import type { DayAggregate } from "../lib/types";

// Render-friendly svg mock: SvgText puts its label inside a real <Text> so
// the date ticks are queryable by text. The structural nodes pass children
// through. (The OverviewScreen test never fires layout, so its inert
// string-host mock is fine there; this test DOES render the plot.)
jest.mock("react-native-svg", () => {
  const RN = require("react-native");
  const React = require("react");
  const pass = (Comp: unknown) => ({ children }: { children?: React.ReactNode }) =>
    React.createElement(RN.View, null, children);
  return {
    __esModule: true,
    default: pass("Svg"),
    Line: () => null,
    Path: () => null,
    Circle: () => null,
    Text: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.Text, null, children),
  };
});

jest.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pan: () => ({
      onBegin() {
        return this;
      },
      onUpdate() {
        return this;
      },
      onFinalize() {
        return this;
      },
    }),
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

import { TrendChart } from "../components/TrendChart";

function makeWindow(n: number, startMonthDay = "2026-01-01"): DayAggregate[] {
  const [y, m, d] = startMonthDay.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(y, m - 1, d + i);
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return {
      date: ymd,
      meal_count: 1,
      plant_pct: 70,
      sat_fat_g: 10,
      soluble_fiber_g: 12,
      calories: 1800,
      protein_g: 80,
      carbs_g: 200,
      alcohol_g: 0,
      kcal_burn: null,
    };
  });
}

// Fire the plot's onLayout so width > 0 and the SVG (with its date labels)
// actually renders.
type Tree = Awaited<ReturnType<typeof render>>;
async function layout(tree: Tree) {
  const nodes = tree.root.queryAll(
    (n) => typeof (n.props as { onLayout?: unknown })?.onLayout === "function"
  );
  // The measured-width state update must flush before the SVG (with its date
  // ticks) renders — wrap the layout event in act so the re-render settles.
  await act(async () => {
    for (const node of nodes) {
      fireEvent(node, "layout", {
        nativeEvent: { layout: { width: 300, height: 96 } },
      });
    }
  });
}

describe("TrendChart range follows the selector", () => {
  it("plots the X-range across the WHOLE 30-day window, not a 7-day tail", async () => {
    const tree = await render(
      <TrendChart
        aggregates={makeWindow(30)}
        title="SOLUBLE FIBER"
        target={10}
        pick={(a) => a.soluble_fiber_g}
        direction="keep_up"
      />
    );
    await layout(tree);
    // The first and last X date ticks span the full window (1 Jan ... 30 Jan),
    // proving the range is the window, not just the last week.
    expect(tree.queryByText("1 Jan")).toBeTruthy();
    expect(tree.queryByText("30 Jan")).toBeTruthy();
    // Per-day range keeps the 7d-avg smoothing label.
    expect(tree.queryByText("7d avg")).toBeTruthy();
    expect(tree.queryByText("weekly")).toBeNull();
  });

  it("spans the full 90-day window on the 3mo selection", async () => {
    const tree = await render(
      <TrendChart
        aggregates={makeWindow(90)}
        title="SAT FAT"
        target={18}
        pick={(a) => a.sat_fat_g}
        direction="keep_down"
      />
    );
    await layout(tree);
    // 90 days from 1 Jan ends on 31 Mar — the last tick is well past the
    // first week, so the chart is genuinely 3 months wide.
    expect(tree.queryByText("1 Jan")).toBeTruthy();
    expect(tree.queryByText("31 Mar")).toBeTruthy();
    expect(tree.queryByText("7d avg")).toBeTruthy();
  });

  it("decimates to weekly on the 1y window (label flips to 'weekly')", async () => {
    const tree = await render(
      <TrendChart
        aggregates={makeWindow(365)}
        title="SOLUBLE FIBER"
        target={10}
        pick={(a) => a.soluble_fiber_g}
        direction="keep_up"
      />
    );
    await layout(tree);
    expect(tree.queryByText("weekly")).toBeTruthy();
    expect(tree.queryByText("7d avg")).toBeNull();
    // The window still spans a year — first tick at the start.
    expect(tree.queryByText("1 Jan")).toBeTruthy();
  });
});
