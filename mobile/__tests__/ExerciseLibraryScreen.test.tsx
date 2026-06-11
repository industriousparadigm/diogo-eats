// Component tests for the new exercise LIBRARY screen — renders the full
// catalog with LAST/BEST sublines, the search filters it client-side, and a
// tapped card opens the CAREER detail.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockFetchStrengthOverview = jest.fn();
const mockGetSnapshot = jest.fn();

jest.mock("../lib/snapshot", () => ({
  getSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
  setSnapshot: jest.fn(),
  snapshotKey: (ns: string, sub?: string) => (sub ? `${ns}.${sub}` : ns),
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
    fetchStrengthOverview: (...args: unknown[]) => mockFetchStrengthOverview(...args),
    ApiError,
  };
});

import ExerciseLibraryScreen from "../app/(app)/strength/exercises";
import { mockStrengthOverview } from "../lib/strengthFixtures";

describe("ExerciseLibraryScreen", () => {
  beforeEach(() => {
    mockFetchStrengthOverview.mockReset();
    mockPush.mockReset();
    mockGetSnapshot.mockReset();
    mockFetchStrengthOverview.mockResolvedValue(mockStrengthOverview());
    mockGetSnapshot.mockResolvedValue(null); // cold cache → fetch fills it
  });

  it("renders the full catalog with LAST/BEST sublines", async () => {
    const { getByText } = await render(<ExerciseLibraryScreen />);
    await waitFor(() => {
      expect(getByText("Leg press")).toBeTruthy();
      expect(getByText("Back extension")).toBeTruthy();
      expect(getByText("Chest press")).toBeTruthy();
      expect(getByText("Seated row")).toBeTruthy();
      expect(getByText("Farmer's carry")).toBeTruthy();
    });
    // A LAST line is present (leg press day-1 numbers).
    expect(getByText("32kg × 12  ·  39kg × 12")).toBeTruthy();
    // A BEST line is present (back extension bodyweight total).
    expect(getByText("24 reps total")).toBeTruthy();
  });

  it("filters the list by the search query, then restores it when cleared", async () => {
    const { getByLabelText, getByText, queryByText } = await render(<ExerciseLibraryScreen />);
    await waitFor(() => expect(getByText("Leg press")).toBeTruthy());

    fireEvent.changeText(getByLabelText("search exercises"), "press");
    await waitFor(() => {
      expect(getByText("Leg press")).toBeTruthy();
      expect(getByText("Chest press")).toBeTruthy();
      expect(queryByText("Seated row")).toBeNull();
      expect(queryByText("Farmer's carry")).toBeNull();
    });

    fireEvent.changeText(getByLabelText("search exercises"), "");
    await waitFor(() => expect(getByText("Seated row")).toBeTruthy());
  });

  it("shows a no-match message for a query with no hits", async () => {
    const { getByLabelText, getByText } = await render(<ExerciseLibraryScreen />);
    await waitFor(() => expect(getByText("Leg press")).toBeTruthy());
    fireEvent.changeText(getByLabelText("search exercises"), "deadlift");
    await waitFor(() => expect(getByText(/No exercises match/)).toBeTruthy());
  });

  it("opens the career detail (no from=session) when a card is tapped", async () => {
    const { getByLabelText } = await render(<ExerciseLibraryScreen />);
    await waitFor(() => getByLabelText("Leg press detail"));
    await fireEvent.press(getByLabelText("Leg press detail"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/strength/exercise/leg-press");
  });

  it("renders from the cached overview without waiting on the fetch", async () => {
    mockGetSnapshot.mockResolvedValue(mockStrengthOverview());
    mockFetchStrengthOverview.mockReturnValue(new Promise(() => {})); // never resolves
    const { getByText } = await render(<ExerciseLibraryScreen />);
    await waitFor(() => expect(getByText("Leg press")).toBeTruthy());
  });

  it("shows an error with retry when the fetch fails and nothing is cached", async () => {
    mockFetchStrengthOverview.mockRejectedValue(new Error("boom"));
    const { getByText } = await render(<ExerciseLibraryScreen />);
    await waitFor(() => {
      expect(getByText("Could not load exercises")).toBeTruthy();
      expect(getByText("Retry")).toBeTruthy();
    });
  });
});
