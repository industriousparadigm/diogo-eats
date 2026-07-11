// Per-type screen — "click into Run, see my runs". Lists that type's sessions
// in the window, tap to edit (activity) or open detail (gym).

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: { type?: string; days?: string } = { type: "run", days: "15" };

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockFetchActivities = jest.fn();
const mockFetchStrengthOverview = jest.fn();
const mockGetSnapshot = jest.fn();
const mockSetSnapshot = jest.fn();

jest.mock("../lib/snapshot", () => ({
  getSnapshot: (...a: unknown[]) => mockGetSnapshot(...a),
  setSnapshot: (...a: unknown[]) => mockSetSnapshot(...a),
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
    fetchActivities: (...a: unknown[]) => mockFetchActivities(...a),
    fetchStrengthOverview: (...a: unknown[]) => mockFetchStrengthOverview(...a),
    updateActivity: jest.fn(),
    deleteActivity: jest.fn(),
    ApiError,
  };
});

import MovementTypeScreen from "../app/(app)/strength/type/[type]";
import { mockStrengthOverview } from "../lib/strengthFixtures";
import type { Activity } from "../lib/activityTypes";

const NOW = new Date(2026, 5, 11, 9, 0).getTime();

function runActivity(): Activity {
  return {
    id: "run-1",
    type: "run",
    label: null,
    started_at: new Date(2026, 5, 10, 8, 0).getTime(),
    duration_min: 42,
    effort: null,
    distance_km: 8.2,
    strain: 10,
    surface: "trail",
    elevation_m: 200,
    photo_filename: null,
    note: null,
    source: "whoop",
    external_id: null,
    rpe: null,
    feel: null,
    training_effect: null,
    created_at: NOW,
  };
}

describe("MovementTypeScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockPush.mockReset();
    mockBack.mockReset();
    mockFetchActivities.mockReset().mockResolvedValue([runActivity()]);
    mockFetchStrengthOverview.mockReset().mockResolvedValue(mockStrengthOverview());
    mockGetSnapshot.mockReset().mockResolvedValue(null);
    mockSetSnapshot.mockReset();
    mockParams = { type: "run", days: "15" };
  });
  afterEach(() => jest.useRealTimers());

  it("titles with the type and lists that type's activities", async () => {
    const { getAllByText, getByLabelText } = await render(<MovementTypeScreen />);
    // The ActivityCard (label "Run <date>"); the (?!image) excludes the
    // MovementImage's "Run image" label.
    await waitFor(() => expect(getByLabelText(/^Run (?!image)/)).toBeTruthy());
    expect(getAllByText("Run").length).toBeGreaterThanOrEqual(1); // title + card typeName
  });

  it("opens the edit sheet when a run is tapped", async () => {
    const { getByLabelText, findByLabelText } = await render(<MovementTypeScreen />);
    await waitFor(() => getByLabelText(/^Run (?!image)/));
    await fireEvent.press(getByLabelText(/^Run (?!image)/));
    expect(await findByLabelText("earlier day")).toBeTruthy();
  });

  it("for gym, lists sessions and opens session detail on tap", async () => {
    mockParams = { type: "gym", days: "15" };
    const { getByLabelText } = await render(<MovementTypeScreen />);
    await waitFor(() => getByLabelText(/gym session/));
    await fireEvent.press(getByLabelText(/gym session/));
    expect(mockPush).toHaveBeenCalledWith("/(app)/strength/log/fixture-day1");
  });

  it("shows an empty state when nothing of the type is in the window", async () => {
    mockFetchActivities.mockResolvedValue([]);
    const { getByText } = await render(<MovementTypeScreen />);
    await waitFor(() => expect(getByText(/No run logged in this window/)).toBeTruthy());
  });

  it("backs out via the back control", async () => {
    const { getByLabelText } = await render(<MovementTypeScreen />);
    await waitFor(() => getByLabelText("back"));
    await fireEvent.press(getByLabelText("back"));
    expect(mockBack).toHaveBeenCalled();
  });
});
