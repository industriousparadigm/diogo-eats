// Component tests for the strength exercise-detail screen — image hero +
// form cue, BEST stat, per-session history, and the progression
// sparkline (only when ≥2 sessions).

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
let mockParams: { id?: string } = { id: "leg-press" };

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

const mockFetchStrengthSessions = jest.fn();
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
    fetchStrengthSessions: (...a: unknown[]) => mockFetchStrengthSessions(...a),
    fetchStrengthOverview: (...a: unknown[]) => mockFetchStrengthOverview(...a),
    ApiError,
  };
});

import ExerciseDetailScreen from "../app/(app)/strength/exercise/[id]";
import { mockSessionDetail, mockStrengthOverview } from "../lib/strengthFixtures";
import type { StrengthSession } from "../lib/strengthTypes";

const day1 = mockSessionDetail("fixture-day1").session;
// A second session with a heavier leg press, two weeks later.
const day2: StrengthSession = {
  id: "fixture-day2",
  started_at: day1.completed_at + 14 * 86400000 - 1000,
  completed_at: day1.completed_at + 14 * 86400000,
  note: null,
  sets: [{ exercise_id: "leg-press", series_index: 1, weight_kg: 41, reps: 10 }],
};

describe("ExerciseDetailScreen", () => {
  beforeEach(() => {
    mockParams = { id: "leg-press" };
    mockFetchStrengthSessions.mockReset();
    mockFetchStrengthOverview.mockReset();
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue(mockStrengthOverview());
    mockFetchStrengthSessions.mockResolvedValue([day1]);
  });

  it("renders the form cue, BEST stat, and per-session history", async () => {
    const { getByText } = await render(<ExerciseDetailScreen />);
    await waitFor(() => {
      expect(getByText(/mid-platform/)).toBeTruthy(); // form cue from fixture
      expect(getByText("BEST")).toBeTruthy();
      expect(getByText("39kg × 12")).toBeTruthy(); // best from overview fixture
      expect(getByText("EVERY SESSION · 1")).toBeTruthy();
    });
  });

  it("shows the progression header when ≥2 sessions exist", async () => {
    mockFetchStrengthSessions.mockResolvedValue([day1, day2]);
    const { getByText } = await render(<ExerciseDetailScreen />);
    await waitFor(() => {
      expect(getByText("PROGRESSION")).toBeTruthy();
      expect(getByText("EVERY SESSION · 2")).toBeTruthy();
    });
  });

  it("hides the progression sparkline with a single session", async () => {
    const { queryByText, getByText } = await render(<ExerciseDetailScreen />);
    await waitFor(() => getByText("BEST"));
    expect(queryByText("PROGRESSION")).toBeNull();
  });

  it("shows an error with retry on failure", async () => {
    mockGetSnapshot.mockResolvedValue(null);
    mockFetchStrengthSessions.mockRejectedValue(new Error("boom"));
    mockFetchStrengthOverview.mockResolvedValue(mockStrengthOverview());
    const { getByText } = await render(<ExerciseDetailScreen />);
    await waitFor(() => {
      expect(getByText("Could not load this exercise")).toBeTruthy();
      expect(getByText("Retry")).toBeTruthy();
    });
  });
});
