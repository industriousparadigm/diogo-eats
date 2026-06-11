// Component tests for the redesigned MealCard (wave-2 item 2) — the
// philosophy restoration. The card is NOT a calorie counter; these tests
// pin the metric hierarchy the redesign establishes:
//   - the Vision one-liner (meal.notes) shows when present, hides when not;
//   - fiber + sat fat are the visible numbers, kcal is demoted and LAST;
//   - the ↻ repeat affordance is GONE from the card;
//   - per-meal sat fat goes amber only when this one meal alone is a large
//     share of the daily target (targets injected, never hardcoded).

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import type { Meal, Targets } from "../lib/types";
import { palette } from "../lib/theme";

jest.mock("expo-image", () => ({ Image: "Image" }));

// PhotoLightbox (rendered by the card) pulls in gesture-handler. A chainable
// no-op gesture + pass-through detector keep the card renderable in tests.
jest.mock("react-native-gesture-handler", () => {
  const makeGesture = () => {
    const g: Record<string, () => unknown> = {};
    for (const k of [
      "minPointers",
      "numberOfTaps",
      "maxDuration",
      "onStart",
      "onUpdate",
      "onEnd",
      "onBegin",
      "onFinalize",
    ]) {
      g[k] = () => g;
    }
    return g;
  };
  const React = require("react");
  return {
    Gesture: {
      Pinch: makeGesture,
      Pan: makeGesture,
      Tap: makeGesture,
      Simultaneous: () => ({}),
      Exclusive: () => ({}),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  };
});

const mockResolvePhotoUrl = jest.fn(async () => "https://example.com/p.jpg");
jest.mock("../lib/api", () => ({
  resolvePhotoUrl: () => mockResolvePhotoUrl(),
}));

import { MealCard } from "../components/MealCard";

const TARGETS: Targets = { sat_fat_g: 18, soluble_fiber_g: 10, calories: 2000, protein_g: 90 };

function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "m1",
    created_at: new Date(2026, 5, 10, 8, 30).getTime(),
    photo_filename: null,
    items_json: JSON.stringify([
      { name: "Oatmeal", grams: 200, confidence: "high", is_plant: true,
        per_100g: { sat_fat_g: 0.8, soluble_fiber_g: 4, calories: 389, protein_g: 17 } },
    ]),
    sat_fat_g: 2,
    soluble_fiber_g: 8,
    calories: 590,
    protein_g: 22,
    plant_pct: 78,
    notes: "Good soluble-fiber start to the day.",
    caption: null,
    meal_vibe: "morning oats",
    ...overrides,
  };
}

describe("MealCard — metric hierarchy (item 2)", () => {
  beforeEach(() => mockResolvePhotoUrl.mockClear());

  it("shows the Vision one-liner (meal.notes) when present", async () => {
    const { getByText } = await render(
      <MealCard meal={makeMeal()} onDelete={jest.fn()} targets={TARGETS} />
    );
    await waitFor(() =>
      expect(getByText("Good soluble-fiber start to the day.")).toBeTruthy()
    );
  });

  it("hides the note line when there is none", async () => {
    const { queryByText } = await render(
      <MealCard meal={makeMeal({ notes: null })} onDelete={jest.fn()} targets={TARGETS} />
    );
    await waitFor(() => expect(queryByText("morning oats")).toBeTruthy());
    expect(queryByText("Good soluble-fiber start to the day.")).toBeNull();
  });

  it("surfaces fiber and sat fat as the visible numbers", async () => {
    const { getByText } = await render(
      <MealCard meal={makeMeal()} onDelete={jest.fn()} targets={TARGETS} />
    );
    await waitFor(() => {
      expect(getByText("fib")).toBeTruthy();
      expect(getByText("sat")).toBeTruthy();
      expect(getByText("pro")).toBeTruthy();
      expect(getByText("8g")).toBeTruthy(); // fiber value
      expect(getByText("2g")).toBeTruthy(); // sat fat value
    });
  });

  it("renders kcal LAST in the metric row, after plant/fiber/sat fat", async () => {
    const { getByText } = await render(
      <MealCard meal={makeMeal()} onDelete={jest.fn()} targets={TARGETS} />
    );
    await waitFor(() => getByText("morning oats"));
    // The kcal value + unit are present (demoted), and the plant %, fiber,
    // and sat fat labels are all present — order is asserted structurally
    // below via the rendered tree.
    expect(getByText("kcal")).toBeTruthy();
    expect(getByText("590")).toBeTruthy();
    expect(getByText("78%")).toBeTruthy();
  });

  it("orders the metric row plant -> fiber -> sat fat -> kcal (kcal last)", async () => {
    // A note free of the metric words so the ordering check reads only the
    // metric row, not the prose above it.
    const { toJSON } = await render(
      <MealCard
        meal={makeMeal({ notes: "A balanced plate." })}
        onDelete={jest.fn()}
        targets={TARGETS}
      />
    );
    // Flatten all Text content in render order and check the metric tokens
    // appear in the intended sequence with kcal at the end.
    const texts: string[] = [];
    const walk = (node: unknown) => {
      if (node == null) return;
      if (typeof node === "string") {
        texts.push(node);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const n = node as { children?: unknown; props?: { children?: unknown } };
      if (n.children !== undefined) walk(n.children);
      else if (n.props) walk(n.props.children);
    };
    walk(toJSON());
    const seq = texts.join("|");
    const iPlant = seq.indexOf("78%");
    const iFiber = seq.indexOf("fib");
    const iSat = seq.indexOf("sat");
    const iPro = seq.indexOf("pro");
    const iKcal = seq.indexOf("kcal");
    expect(iPlant).toBeGreaterThanOrEqual(0);
    expect(iFiber).toBeGreaterThan(iPlant);
    expect(iSat).toBeGreaterThan(iFiber);
    expect(iPro).toBeGreaterThan(iSat);
    expect(iKcal).toBeGreaterThan(iPro); // kcal is last
  });

  it("has NO repeat (↻) affordance on the card", async () => {
    const { queryByLabelText, queryByText } = await render(
      <MealCard meal={makeMeal()} onDelete={jest.fn()} targets={TARGETS} />
    );
    await waitFor(() => queryByText("morning oats"));
    expect(queryByLabelText("log this meal again")).toBeNull();
    expect(queryByText("↻ again")).toBeNull();
  });
});

describe("MealCard — per-meal sat fat coloring (item 2 judgment call)", () => {
  beforeEach(() => mockResolvePhotoUrl.mockClear());

  function satFatColorOf(satFat: number, target: number) {
    return render(
      <MealCard
        meal={makeMeal({ sat_fat_g: satFat })}
        onDelete={jest.fn()}
        targets={{ ...TARGETS, sat_fat_g: target }}
      />
    );
  }

  it("keeps a normal meal's sat fat NEUTRAL (not amber)", async () => {
    const { getByText } = await satFatColorOf(2, 18); // 2/18 ≈ 11%
    const node = await waitFor(() => getByText("2g"));
    const flat = flattenStyle(node.props.style);
    expect(flat.color).not.toBe(palette.warn);
  });

  it("turns a big single-meal sat fat AMBER (>= 60% of daily target)", async () => {
    const { getByText } = await satFatColorOf(12, 18); // 12/18 ≈ 67%
    const node = await waitFor(() => getByText("12g"));
    const flat = flattenStyle(node.props.style);
    expect(flat.color).toBe(palette.warn);
  });
});

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce(
      (acc: Record<string, unknown>, s) => ({ ...acc, ...flattenStyle(s) }),
      {}
    );
  }
  return (style as Record<string, unknown>) ?? {};
}
