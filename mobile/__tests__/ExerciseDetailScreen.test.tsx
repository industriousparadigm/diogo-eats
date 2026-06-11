// Component tests for the context-aware strength exercise-detail screen.
//
// ONE screen, two modes via the `from` route param:
//   - CAREER (default): big image hero, BEST stat, progression sparkline
//     (≥2 sessions), and the full chronological timeline.
//   - GYM-NOW (from=session): the image hero, "LAST TIME" big, today's
//     logged sets from the live draft, and a "Log this" button. No career
//     clutter (no BEST card, no sparkline, no full timeline).
// Plus the cold-cache guard: skeleton while resolving, honest "not found"
// when an unknown id never resolves.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
let mockParams: { id?: string; from?: string } = { id: "leg-press" };

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
import { clearDraft, saveDraft } from "../lib/draftStorage";
import { confirmSeries, createDraft } from "../lib/strengthSession";
import { takeLogExercise } from "../lib/stores";
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
  beforeEach(async () => {
    mockParams = { id: "leg-press" };
    mockFetchStrengthSessions.mockReset();
    mockFetchStrengthOverview.mockReset();
    mockGetSnapshot.mockReset();
    mockBack.mockReset();
    await clearDraft();
    takeLogExercise(); // drain any stashed handoff
    mockGetSnapshot.mockResolvedValue(mockStrengthOverview());
    mockFetchStrengthSessions.mockResolvedValue([day1]);
  });

  // ---- CAREER mode (default) ----

  describe("career mode (default)", () => {
    it("renders the name, form cue, BEST stat, and the full timeline", async () => {
      const { getByText } = await render(<ExerciseDetailScreen />);
      await waitFor(() => {
        expect(getByText("Leg press")).toBeTruthy(); // name as display type
        expect(getByText(/mid-platform/)).toBeTruthy(); // form cue
        expect(getByText("best")).toBeTruthy(); // StatNumber label (uppercased in CSS)
        expect(getByText("39kg × 12")).toBeTruthy(); // BEST value from overview fixture
        expect(getByText("EVERY SESSION · 1")).toBeTruthy();
      });
    });

    it("shows the progression sparkline when ≥2 sessions exist", async () => {
      mockFetchStrengthSessions.mockResolvedValue([day1, day2]);
      const { getByText } = await render(<ExerciseDetailScreen />);
      await waitFor(() => {
        expect(getByText("PROGRESSION")).toBeTruthy();
        expect(getByText("EVERY SESSION · 2")).toBeTruthy();
      });
    });

    it("hides the progression sparkline with a single session", async () => {
      const { queryByText, getByText } = await render(<ExerciseDetailScreen />);
      await waitFor(() => getByText("EVERY SESSION · 1"));
      expect(queryByText("PROGRESSION")).toBeNull();
    });

    it("does NOT show gym-now blocks (no LAST TIME header, no Log this)", async () => {
      const { queryByText, getByText } = await render(<ExerciseDetailScreen />);
      await waitFor(() => getByText("EVERY SESSION · 1"));
      expect(queryByText("LAST TIME")).toBeNull();
      expect(queryByText("Log this")).toBeNull();
    });
  });

  // ---- GYM-NOW mode (from=session) ----

  describe("gym-now mode (from=session)", () => {
    beforeEach(() => {
      mockParams = { id: "leg-press", from: "session" };
    });

    it("shows LAST TIME numbers and a Log this button, not the career blocks", async () => {
      const { getByText, queryByText, getByLabelText } = await render(
        <ExerciseDetailScreen />
      );
      await waitFor(() => {
        expect(getByText("LAST TIME")).toBeTruthy();
        expect(getByText("32kg × 12")).toBeTruthy(); // last series, big
        expect(getByText("39kg × 12")).toBeTruthy();
        expect(getByLabelText("log this exercise")).toBeTruthy();
      });
      // Career clutter is gone in gym-now mode.
      expect(queryByText("EVERY SESSION · 1")).toBeNull();
      expect(queryByText("PROGRESSION")).toBeNull();
      expect(queryByText("best")).toBeNull();
    });

    it("never fetches the full session log on the gym floor", async () => {
      const { getByText } = await render(<ExerciseDetailScreen />);
      await waitFor(() => getByText("LAST TIME"));
      expect(mockFetchStrengthSessions).not.toHaveBeenCalled();
    });

    it("surfaces today's confirmed sets from the live draft", async () => {
      // A draft where leg-press has one confirmed set this session.
      const draft = confirmSeries(
        createDraft(mockStrengthOverview(), Date.now()),
        "leg-press",
        0
      );
      await saveDraft(draft);
      const { getByText } = await render(<ExerciseDetailScreen />);
      await waitFor(() => {
        expect(getByText("TODAY · 1 SET")).toBeTruthy();
      });
    });

    it("Log this stashes the exercise for the session and pops back", async () => {
      const { getByLabelText } = await render(<ExerciseDetailScreen />);
      await waitFor(() => getByLabelText("log this exercise"));
      await fireEvent.press(getByLabelText("log this exercise"));
      expect(mockBack).toHaveBeenCalled();
      expect(takeLogExercise()).toBe("leg-press");
    });
  });

  // ---- cold-cache guard ----

  describe("cold-cache guard", () => {
    it("shows a skeleton, not a blank screen, while metadata resolves", async () => {
      // No snapshot, and an overview fetch that never resolves.
      mockGetSnapshot.mockResolvedValue(null);
      mockFetchStrengthOverview.mockReturnValue(new Promise(() => {}));
      mockFetchStrengthSessions.mockReturnValue(new Promise(() => {}));
      const { findByLabelText } = await render(<ExerciseDetailScreen />);
      expect(await findByLabelText("loading exercise")).toBeTruthy();
    });

    it("shows an honest 'not found' state when the id never resolves", async () => {
      // Deep-link into an unknown id: nothing cached, the overview has no
      // such exercise. The screen must say so, not render blank.
      mockParams = { id: "ghost-exercise" };
      mockGetSnapshot.mockResolvedValue(null);
      mockFetchStrengthOverview.mockResolvedValue(mockStrengthOverview());
      mockFetchStrengthSessions.mockResolvedValue([]);
      const { getByText } = await render(<ExerciseDetailScreen />);
      await waitFor(() => {
        expect(getByText(/Couldn't find this exercise/)).toBeTruthy();
      });
    });

    it("shows an error with retry when the fetch fails and nothing was cached", async () => {
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
});
