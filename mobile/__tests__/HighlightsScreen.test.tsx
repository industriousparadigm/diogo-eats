// Component tests for the post-session highlights screen — renders the
// API's lines verbatim, beats line leading.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockDismissTo = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    dismissTo: mockDismissTo,
    back: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import HighlightsScreen from "../app/(app)/strength/highlights";
import { stashSessionResult, takeSessionResult } from "../lib/stores";
import type { CompleteSessionResult } from "../lib/strengthTypes";

function result(): CompleteSessionResult {
  return {
    session: {
      id: "s2",
      started_at: 1,
      completed_at: 2,
      note: "easy day",
      sets: [
        { exercise_id: "leg-press", series_index: 1, weight_kg: 41, reps: 12 },
        { exercise_id: "seated-row", series_index: 1, weight_kg: 32, reps: 12 },
      ],
    },
    highlights: [
      { id: "frequency", line: "2nd session in June.", priority: 3 },
      {
        id: "beats",
        line: "You beat 2 numbers: leg press 41kg, row 32kg both sets.",
        priority: 1,
        beats: [],
      },
      {
        id: "next_target",
        line: "Next time: 34kg chest press is there for the taking.",
        priority: 4,
      },
    ],
  };
}

describe("HighlightsScreen", () => {
  beforeEach(() => {
    takeSessionResult(); // drain
    mockDismissTo.mockReset();
  });

  it("renders every highlight line verbatim", async () => {
    stashSessionResult(result());
    const { getByText } = await render(<HighlightsScreen />);
    expect(
      getByText("You beat 2 numbers: leg press 41kg, row 32kg both sets.")
    ).toBeTruthy();
    expect(getByText("2nd session in June.")).toBeTruthy();
    expect(
      getByText("Next time: 34kg chest press is there for the taking.")
    ).toBeTruthy();
  });

  it("summarizes the session and shows the note", async () => {
    stashSessionResult(result());
    const { getByText } = await render(<HighlightsScreen />);
    expect(getByText("2 exercises · 2 sets")).toBeTruthy();
    expect(getByText("“easy day”")).toBeTruthy();
  });

  it("Done returns to the strength tab", async () => {
    stashSessionResult(result());
    const { getByText } = await render(<HighlightsScreen />);
    await fireEvent.press(getByText("Done"));
    await waitFor(() => {
      expect(mockDismissTo).toHaveBeenCalledWith("/(app)/(tabs)/strength");
    });
  });

  it("handles a cold open without a session", async () => {
    const { getByText } = await render(<HighlightsScreen />);
    expect(getByText("No session to show")).toBeTruthy();
  });
});
