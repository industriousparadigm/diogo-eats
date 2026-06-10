// Component tests for the strength session-detail screen — header
// date/note, per-exercise logged series, and the beats achieved that day.

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
let mockParams: { id?: string } = { id: "fixture-day1" };

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockFetchStrengthSession = jest.fn();
const mockFetchStrengthOverview = jest.fn();
const mockGetSnapshot = jest.fn();

jest.mock("../lib/snapshot", () => ({
  getSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
  setSnapshot: jest.fn(),
  snapshotKey: (ns: string) => ns,
}));

jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    fetchStrengthSession: (...a: unknown[]) => mockFetchStrengthSession(...a),
    fetchStrengthOverview: (...a: unknown[]) => mockFetchStrengthOverview(...a),
    ApiError,
  };
});

import SessionDetailScreen from "../app/(app)/strength/log/[id]";
import { mockSessionDetail, mockStrengthOverview } from "../lib/strengthFixtures";
import type { SessionDetail } from "../lib/strengthTypes";

describe("SessionDetailScreen", () => {
  beforeEach(() => {
    mockParams = { id: "fixture-day1" };
    mockFetchStrengthSession.mockReset();
    mockFetchStrengthOverview.mockReset();
    mockGetSnapshot.mockReset();
    mockBack.mockReset();
    // Exercise metadata comes from the cached overview by default.
    mockGetSnapshot.mockResolvedValue(mockStrengthOverview());
    mockFetchStrengthSession.mockResolvedValue(mockSessionDetail("fixture-day1"));
  });

  it("renders the date, note, and per-exercise series with names", async () => {
    const { getByText } = await render(<SessionDetailScreen />);
    await waitFor(() => {
      expect(getByText("Leg press")).toBeTruthy();
      expect(getByText("Chest press")).toBeTruthy();
    });
    // Day-1 note + a logged leg-press series.
    expect(getByText(/banho turco/)).toBeTruthy();
    expect(getByText("WHAT YOU LOGGED")).toBeTruthy();
  });

  it("shows no beats section when the session beat nothing", async () => {
    const { queryByText, getByText } = await render(<SessionDetailScreen />);
    await waitFor(() => getByText("Leg press"));
    expect(queryByText(/NUMBER.? BEATEN/)).toBeNull();
  });

  it("renders a beats section + chip when the session beat numbers", async () => {
    const detail: SessionDetail = {
      ...mockSessionDetail("s2"),
      beats: [
        { exercise_id: "leg-press", kind: "weight", from: 39, to: 41 },
        { exercise_id: "seated-row", kind: "reps_at_weight", from: 12, to: 24, at_weight_kg: 32 },
      ],
    };
    mockFetchStrengthSession.mockResolvedValue(detail);
    const { getByText, getAllByText } = await render(<SessionDetailScreen />);
    await waitFor(() => {
      expect(getByText("2 NUMBERS BEATEN")).toBeTruthy();
      expect(getByText("39 → 41kg")).toBeTruthy();
      expect(getByText("12 → 24 reps @ 32kg")).toBeTruthy();
    });
    // Beaten exercises wear a "beat ↑" chip in their card.
    expect(getAllByText("beat ↑").length).toBeGreaterThan(0);
  });

  it("shows an error with retry on failure", async () => {
    mockGetSnapshot.mockResolvedValue(null);
    mockFetchStrengthSession.mockRejectedValue(new Error("boom"));
    mockFetchStrengthOverview.mockResolvedValue(mockStrengthOverview());
    const { getByText } = await render(<SessionDetailScreen />);
    await waitFor(() => {
      expect(getByText("Could not load this session")).toBeTruthy();
      expect(getByText("Retry")).toBeTruthy();
    });
  });
});
