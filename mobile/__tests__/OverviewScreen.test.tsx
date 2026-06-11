// Component tests for the Looking back tab — headline, heatmap,
// coverage-honest averages, trends, and the day-pick handoff.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import type { DayAggregate } from "../lib/types";

const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: mockNavigate, push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    const React = require("react");
    React.useEffect(() => {
      cb();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: "Svg",
  Line: "Line",
  Path: "Path",
  Circle: "Circle",
  Text: "SvgText",
}));

// The trend charts wrap their plot in a GestureDetector (touch scrubbing).
// In tests the detector and gesture are inert pass-throughs.
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

const mockFetchStats = jest.fn();
const mockFetchProfile = jest.fn();

jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    fetchStats: (...args: unknown[]) => mockFetchStats(...args),
    fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
    ApiError,
  };
});

import OverviewScreen from "../app/(app)/(tabs)/overview";
import { consumePendingDay } from "../lib/stores";

function day(date: string, overrides: Partial<DayAggregate> = {}): DayAggregate {
  return {
    date,
    meal_count: 2,
    plant_pct: 75,
    sat_fat_g: 9,
    soluble_fiber_g: 12,
    calories: 1900,
    protein_g: 85,
    carbs_g: 200,
    alcohol_g: 0,
    kcal_burn: null,
    ...overrides,
  };
}

const WEEK = [
  day("2026-06-04"),
  day("2026-06-05"),
  day("2026-06-06"),
  day("2026-06-07"),
  day("2026-06-08"),
  day("2026-06-09"),
  day("2026-06-10"),
];

describe("OverviewScreen", () => {
  beforeEach(() => {
    mockFetchStats.mockReset();
    mockFetchProfile.mockReset();
    mockNavigate.mockReset();
    mockFetchProfile.mockResolvedValue({
      sat_fat_g: 18,
      soluble_fiber_g: 10,
      calories: 2000,
      protein_g: 90,
    });
    consumePendingDay(); // drain any day left by earlier tests
  });

  it("shows a design-language skeleton (not a blank box) while loading", async () => {
    mockFetchStats.mockReturnValue(new Promise(() => {}));
    const { findByLabelText, queryByText } = await render(<OverviewScreen />);
    expect(await findByLabelText("loading history")).toBeTruthy();
    // None of the resolved content (headline, averages, count) shows yet.
    expect(queryByText(/days logged in this window/)).toBeNull();
  });

  it("renders the rolling headline from the aggregates", async () => {
    mockFetchStats.mockResolvedValue(WEEK);
    const { getByText } = await render(<OverviewScreen />);
    await waitFor(() => {
      expect(getByText(/Last 7 logged days/)).toBeTruthy();
      expect(getByText(/plant-leaning/)).toBeTruthy();
    });
  });

  it("shows first-days copy below 3 logged days", async () => {
    mockFetchStats.mockResolvedValue([day("2026-06-10")]);
    const { getByText } = await render(<OverviewScreen />);
    await waitFor(() => {
      expect(getByText(/1 day in/)).toBeTruthy();
    });
  });

  it("shows coverage-honest averages over logged days in the window", async () => {
    const withGap = [...WEEK, day("2026-06-11", { meal_count: 0, calories: 0 })];
    mockFetchStats.mockResolvedValue(withGap);
    const { getByText } = await render(<OverviewScreen />);
    await waitFor(() => {
      // The averages card is window-scoped, logged-days-only (item 4).
      expect(getByText("AVERAGES · LOGGED DAYS THIS WINDOW")).toBeTruthy();
      // 7 logged days — the unlogged 8th doesn't count — said in the
      // coverage line.
      expect(getByText("7 logged days in this window")).toBeTruthy();
      expect(getByText("75%")).toBeTruthy();
    });
  });

  it("shows the logged-days count", async () => {
    mockFetchStats.mockResolvedValue(WEEK);
    const { getByText } = await render(<OverviewScreen />);
    await waitFor(() => {
      expect(getByText("7 days logged in this window")).toBeTruthy();
    });
  });

  it("defaults the period to 15 days (15d)", async () => {
    mockFetchStats.mockResolvedValue(WEEK);
    await render(<OverviewScreen />);
    await waitFor(() => {
      expect(mockFetchStats).toHaveBeenCalledWith(15);
    });
  });

  it("the one selector drives the fetch — every period maps straight to days", async () => {
    mockFetchStats.mockResolvedValue(WEEK);
    const { getByLabelText } = await render(<OverviewScreen />);
    await waitFor(() => expect(mockFetchStats).toHaveBeenCalledWith(15));

    await fireEvent.press(getByLabelText("show 7d"));
    await waitFor(() => expect(mockFetchStats).toHaveBeenCalledWith(7));

    await fireEvent.press(getByLabelText("show 1mo"));
    await waitFor(() => expect(mockFetchStats).toHaveBeenCalledWith(30));

    await fireEvent.press(getByLabelText("show 3mo"));
    await waitFor(() => expect(mockFetchStats).toHaveBeenCalledWith(90));

    await fireEvent.press(getByLabelText("show 1y"));
    await waitFor(() => expect(mockFetchStats).toHaveBeenCalledWith(365));
  });

  it("renders the day-level signals card over the window", async () => {
    // 7 logged days, one with alcohol, all fully plant=false (plant_pct 75).
    const withAlcohol = [
      ...WEEK.slice(0, 6),
      day("2026-06-10", { alcohol_g: 14 }),
    ];
    mockFetchStats.mockResolvedValue(withAlcohol);
    const { getByText } = await render(<OverviewScreen />);
    await waitFor(() => {
      expect(getByText("SIGNALS · THIS WINDOW")).toBeTruthy();
      // One alcohol day -> the singular label (a calm fact, never red).
      expect(getByText("day with alcohol")).toBeTruthy();
      expect(getByText("days fully logged")).toBeTruthy();
    });
  });

  it("renders both trend charts when there's enough data", async () => {
    mockFetchStats.mockResolvedValue(WEEK);
    const { getByText, getAllByText } = await render(<OverviewScreen />);
    await waitFor(() => {
      expect(getByText("SOLUBLE FIBER")).toBeTruthy();
      expect(getByText("SAT FAT")).toBeTruthy();
      // Both charts demote the smoothing window to a small "7d avg" label.
      expect(getAllByText("7d avg").length).toBe(2);
    });
  });

  it("taps a heatmap day -> stores the day and navigates to the food tab", async () => {
    mockFetchStats.mockResolvedValue(WEEK);
    const { getByLabelText } = await render(<OverviewScreen />);
    await waitFor(() => getByLabelText("2026-06-08: 2 meals, 75% plant"));
    await fireEvent.press(getByLabelText("2026-06-08: 2 meals, 75% plant"));
    expect(consumePendingDay()).toBe("2026-06-08");
    expect(mockNavigate).toHaveBeenCalledWith("/(app)/(tabs)");
  });

  it("shows an error with retry when stats fail", async () => {
    mockFetchStats.mockRejectedValue(new Error("boom"));
    const { getByText } = await render(<OverviewScreen />);
    await waitFor(() => {
      expect(getByText("Could not load history")).toBeTruthy();
      expect(getByText("Retry")).toBeTruthy();
    });
  });
});
