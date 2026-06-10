// Component tests for the Strength overview tab — start/resume button,
// per-exercise last/best numbers, session history with beats counts.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), navigate: jest.fn() }),
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

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockFetchStrengthOverview = jest.fn();

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

import StrengthScreen from "../app/(app)/(tabs)/strength";
import { mockStrengthOverview } from "../lib/strengthFixtures";
import { saveDraft, clearDraft } from "../lib/draftStorage";
import { createDraft } from "../lib/strengthSession";

describe("StrengthScreen", () => {
  beforeEach(async () => {
    mockFetchStrengthOverview.mockReset();
    mockPush.mockReset();
    await clearDraft();
    mockFetchStrengthOverview.mockResolvedValue(mockStrengthOverview());
  });

  it("shows the Start session button and pushes the capture flow", async () => {
    const { getByText } = await render(<StrengthScreen />);
    await waitFor(() => getByText("Start session"));
    await fireEvent.press(getByText("Start session"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/strength/session");
  });

  it("offers Resume when a draft is in progress", async () => {
    await saveDraft(createDraft(mockStrengthOverview(), Date.now()));
    const { getByText } = await render(<StrengthScreen />);
    await waitFor(() => {
      expect(getByText("Resume session")).toBeTruthy();
      expect(getByText("a session is in progress")).toBeTruthy();
    });
  });

  it("renders every exercise with last and best numbers", async () => {
    const { getByText, getAllByText } = await render(<StrengthScreen />);
    await waitFor(() => {
      expect(getByText("Leg press")).toBeTruthy();
      expect(getByText("Back extension")).toBeTruthy();
      expect(getByText("Chest press")).toBeTruthy();
      expect(getByText("Seated row")).toBeTruthy();
      expect(getByText("Farmer's carry")).toBeTruthy();
    });
    // Day-1 numbers, formatted.
    expect(getByText("32kg × 12  ·  39kg × 12")).toBeTruthy(); // leg press last
    expect(getByText("24 reps total")).toBeTruthy(); // back extension best
    expect(getAllByText("2 × (16kg × 60 steps)").length).toBeGreaterThan(0); // carry last
  });

  it("shows 'not done yet' for a never-done exercise", async () => {
    const overview = mockStrengthOverview();
    overview.states[0] = {
      ...overview.states[0],
      last: null,
      best: null,
      prefill: { series: [{ weight_kg: null, reps: 10 }], never_done: true },
    };
    mockFetchStrengthOverview.mockResolvedValue(overview);
    const { getByText } = await render(<StrengthScreen />);
    await waitFor(() => {
      expect(getByText("not done yet")).toBeTruthy();
    });
  });

  it("lists session history with a beats count", async () => {
    const { getByText } = await render(<StrengthScreen />);
    await waitFor(() => {
      expect(getByText("Wed 10 Jun")).toBeTruthy();
      expect(getByText("0 beats")).toBeTruthy();
      expect(getByText(/5 exercises/)).toBeTruthy();
    });
  });

  it("shows an error with retry when the overview fails", async () => {
    mockFetchStrengthOverview.mockRejectedValue(new Error("boom"));
    const { getByText } = await render(<StrengthScreen />);
    await waitFor(() => {
      expect(getByText("Could not load strength data")).toBeTruthy();
      expect(getByText("Retry")).toBeTruthy();
    });
  });
});
