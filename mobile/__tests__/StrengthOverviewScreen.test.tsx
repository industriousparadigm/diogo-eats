// Component tests for the redesigned Strength LANDING (a dashboard, not a
// catalog): start/resume hero, the month stat strip, the promoted RECENT
// SESSIONS list, and the "All exercises" row into the library.
//
// The per-exercise "THE NUMBERS TO BEAT" catalog LEFT the landing — there's
// an explicit assertion below that the landing does NOT render the exercise
// list (it lives in the library + each exercise's career detail now).

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
const mockGetSnapshot = jest.fn();
const mockSetSnapshot = jest.fn();

// Snapshot cache — controlled per-test (cold cache → skeleton, hit → data).
jest.mock("../lib/snapshot", () => ({
  getSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
  setSnapshot: (...args: unknown[]) => mockSetSnapshot(...args),
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

import StrengthScreen from "../app/(app)/(tabs)/strength";
import { mockStrengthOverview } from "../lib/strengthFixtures";
import { saveDraft, clearDraft } from "../lib/draftStorage";
import { createDraft } from "../lib/strengthSession";

// The fixture's lone session completed 10 Jun 2026 18:00 local. Freeze "now"
// to mid-June 2026 so the stat strip's month bucketing is deterministic
// (the session is in-month).
const NOW = new Date(2026, 5, 11, 9, 0).getTime();

describe("StrengthScreen (landing)", () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockFetchStrengthOverview.mockReset();
    mockPush.mockReset();
    await clearDraft();
    mockFetchStrengthOverview.mockResolvedValue(mockStrengthOverview());
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue(null); // cold cache by default
    mockSetSnapshot.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a skeleton scoreboard (not a blank screen) while loading", async () => {
    mockFetchStrengthOverview.mockReturnValue(new Promise(() => {}));
    const { findByLabelText, queryByText } = await render(<StrengthScreen />);
    expect(await findByLabelText("loading strength")).toBeTruthy();
    // The Start action is always present; the dashboard body is not yet.
    expect(queryByText("RECENT SESSIONS")).toBeNull();
  });

  it("renders the cached dashboard immediately, then refreshes silently", async () => {
    const cached = mockStrengthOverview();
    cached.sessions = cached.sessions.map((s) => ({ ...s, note: "cached" }));
    mockGetSnapshot.mockResolvedValue(cached);
    let resolveFresh: (o: ReturnType<typeof mockStrengthOverview>) => void = () => {};
    mockFetchStrengthOverview.mockReturnValue(new Promise((res) => (resolveFresh = res)));
    const { getByText, queryByLabelText } = await render(<StrengthScreen />);
    await waitFor(() => expect(getByText("RECENT SESSIONS")).toBeTruthy());
    expect(queryByLabelText("loading strength")).toBeNull();
    resolveFresh(mockStrengthOverview());
    await waitFor(() => expect(getByText("RECENT SESSIONS")).toBeTruthy());
  });

  it("writes the snapshot after a successful overview fetch", async () => {
    await render(<StrengthScreen />);
    await waitFor(() => {
      expect(mockSetSnapshot).toHaveBeenCalledWith("strength", undefined, expect.any(Object));
    });
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

  it("does NOT render the per-exercise catalog on the landing (it moved to the library)", async () => {
    const { queryByText, getByText } = await render(<StrengthScreen />);
    // The dashboard is up…
    await waitFor(() => expect(getByText("RECENT SESSIONS")).toBeTruthy());
    // …but the old per-exercise list and its header are gone.
    expect(queryByText("THE NUMBERS TO BEAT")).toBeNull();
    expect(queryByText("Leg press")).toBeNull();
    expect(queryByText("Chest press")).toBeNull();
    expect(queryByText("Farmer's carry")).toBeNull();
  });

  it("renders the month stat strip from the session data", async () => {
    const { getByText } = await render(<StrengthScreen />);
    await waitFor(() => {
      // 1 session this (frozen) month, 0 beats, last session 10 Jun.
      expect(getByText("sessions · mo")).toBeTruthy();
      expect(getByText("beats · mo")).toBeTruthy();
      expect(getByText("last session")).toBeTruthy();
      expect(getByText("10 Jun")).toBeTruthy(); // last-session date cell
    });
  });

  it("promotes RECENT SESSIONS with exercise names + a beats badge → detail", async () => {
    const { getByText, getByLabelText } = await render(<StrengthScreen />);
    await waitFor(() => {
      expect(getByText("RECENT SESSIONS")).toBeTruthy();
      expect(getByText("Wed 10 Jun")).toBeTruthy();
      expect(getByText("0 beats")).toBeTruthy();
      // Exercise NAMES, not a bare count.
      expect(getByText(/Leg press · Back extension/)).toBeTruthy();
    });
    await fireEvent.press(getByLabelText("session Wed 10 Jun"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/strength/log/fixture-day1");
  });

  it("opens the library from the 'All exercises' row", async () => {
    const { getByLabelText } = await render(<StrengthScreen />);
    await waitFor(() => getByLabelText("all exercises"));
    await fireEvent.press(getByLabelText("all exercises"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/strength/exercises");
  });

  it("shows an empty state when there are no sessions", async () => {
    const overview = mockStrengthOverview();
    overview.sessions = [];
    mockFetchStrengthOverview.mockResolvedValue(overview);
    const { getByText } = await render(<StrengthScreen />);
    await waitFor(() => {
      expect(getByText(/No sessions yet/)).toBeTruthy();
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
