// Component tests for the MOVEMENT landing (formerly Strength). The landing
// is an OVERVIEW, not a feed: a RHYTHM grid ("am I moving?") and BY ACTIVITY
// rollups (one card per type — count + strain + recency, expand for the
// sessions). Asserts: ONE front door (a single "+ Log movement" hero, no
// "Start session"), Resume only with a draft, picking gym routes into the
// session flow, the rhythm glance, the per-type rollups (NOT a flat timeline
// of identical cards), expand → the type's sessions, tapping a session row
// opens its detail/edit, the "All exercises" row, and that the per-exercise
// catalog is still gone from the landing.

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
const mockFetchActivities = jest.fn();
const mockGetSnapshot = jest.fn();
const mockSetSnapshot = jest.fn();

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
    fetchActivities: (...args: unknown[]) => mockFetchActivities(...args),
    createActivity: jest.fn(),
    updateActivity: jest.fn(),
    deleteActivity: jest.fn(),
    ApiError,
  };
});

import MovementScreen from "../app/(app)/(tabs)/strength";
import { mockStrengthOverview } from "../lib/strengthFixtures";
import { saveDraft, clearDraft } from "../lib/draftStorage";
import { createDraft } from "../lib/strengthSession";
import type { Activity } from "../lib/activityTypes";

// The fixture's lone session completed 10 Jun 2026 18:00 local.
const NOW = new Date(2026, 5, 11, 9, 0).getTime();

// A padel activity on 11 Jun — both it and the 10 Jun gym session sit inside
// the 28-day window, so the landing shows a Padel rollup AND a Gym rollup.
function padelActivity(strain: number | null = 12.4): Activity {
  return {
    id: "act-padel-1",
    type: "padel",
    label: "class",
    started_at: new Date(2026, 5, 11, 8, 0).getTime(),
    duration_min: 90,
    effort: "light",
    distance_km: null,
    strain,
    surface: null,
    elevation_m: null,
    photo_filename: null,
    note: null,
    source: strain == null ? "manual" : "whoop",
    external_id: null,
    created_at: NOW,
  };
}

describe("MovementScreen (landing)", () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockFetchStrengthOverview.mockReset();
    mockFetchActivities.mockReset();
    mockPush.mockReset();
    await clearDraft();
    mockFetchStrengthOverview.mockResolvedValue(mockStrengthOverview());
    mockFetchActivities.mockResolvedValue([padelActivity()]);
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue(null); // cold cache by default
    mockSetSnapshot.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a skeleton (not a blank screen) while loading", async () => {
    mockFetchStrengthOverview.mockReturnValue(new Promise(() => {}));
    const { findByLabelText, queryByText } = await render(<MovementScreen />);
    expect(await findByLabelText("loading strength")).toBeTruthy();
    expect(queryByText("BY ACTIVITY")).toBeNull();
  });

  it("renders the cached dashboard immediately, then refreshes silently", async () => {
    const cached = mockStrengthOverview();
    cached.sessions = cached.sessions.map((s) => ({ ...s, note: "cached" }));
    mockGetSnapshot.mockResolvedValueOnce(cached); // overview snapshot
    mockGetSnapshot.mockResolvedValueOnce(null); // activities snapshot
    let resolveFresh: (o: ReturnType<typeof mockStrengthOverview>) => void = () => {};
    mockFetchStrengthOverview.mockReturnValue(new Promise((res) => (resolveFresh = res)));
    const { getByText, queryByLabelText } = await render(<MovementScreen />);
    await waitFor(() => expect(getByText("BY ACTIVITY")).toBeTruthy());
    expect(queryByLabelText("loading strength")).toBeNull();
    resolveFresh(mockStrengthOverview());
    await waitFor(() => expect(getByText("BY ACTIVITY")).toBeTruthy());
  });

  it("writes the overview snapshot after a successful fetch", async () => {
    await render(<MovementScreen />);
    await waitFor(() => {
      expect(mockSetSnapshot).toHaveBeenCalledWith("strength", undefined, expect.any(Object));
    });
  });

  it("shows ONE front door: a single + Log movement hero, no Start session", async () => {
    const { getByLabelText, queryByText } = await render(<MovementScreen />);
    await waitFor(() => getByLabelText("log movement"));
    // The old dual hero's "Start session" button is gone — gym is now a card
    // in the sheet, not a separate hero.
    expect(queryByText("Start session")).toBeNull();
  });

  it("opens the quick-log sheet from + Log movement", async () => {
    const { getByLabelText, findByLabelText } = await render(<MovementScreen />);
    await waitFor(() => getByLabelText("log movement"));
    await fireEvent.press(getByLabelText("log movement"));
    // The sheet's type grid is up — gym leads it, padel tile is reachable.
    expect(await findByLabelText("type Gym")).toBeTruthy();
    expect(await findByLabelText("type Padel")).toBeTruthy();
  });

  it("picking gym in the sheet routes into the session flow", async () => {
    const { getByLabelText, findByLabelText } = await render(<MovementScreen />);
    await waitFor(() => getByLabelText("log movement"));
    await fireEvent.press(getByLabelText("log movement"));
    const gym = await findByLabelText("type Gym");
    await fireEvent.press(gym);
    expect(mockPush).toHaveBeenCalledWith("/(app)/strength/session");
  });

  it("offers Resume ONLY when a draft is in progress", async () => {
    await saveDraft(createDraft(mockStrengthOverview(), Date.now()));
    const { getByText } = await render(<MovementScreen />);
    await waitFor(() => {
      expect(getByText("Resume session")).toBeTruthy();
    });
    // Resume routes into the same session flow.
    await fireEvent.press(getByText("Resume session"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/strength/session");
  });

  it("does NOT show a Resume button when there is no draft", async () => {
    const { getByLabelText, queryByText } = await render(<MovementScreen />);
    await waitFor(() => getByLabelText("log movement"));
    expect(queryByText("Resume session")).toBeNull();
  });

  it("does NOT render the per-exercise catalog on the landing", async () => {
    const { queryByText, getByText } = await render(<MovementScreen />);
    await waitFor(() => expect(getByText("BY ACTIVITY")).toBeTruthy());
    expect(queryByText("THE NUMBERS TO BEAT")).toBeNull();
  });

  it("shows the rhythm glance, not the old movements/active-days stat strip", async () => {
    const { getByLabelText, queryByText } = await render(<MovementScreen />);
    // The rhythm card carries an 'am I moving' summary label (28-day window).
    await waitFor(() => expect(getByLabelText(/moved \d+ of 28 days/)).toBeTruthy());
    // The old bare stat-strip cells are gone.
    expect(queryByText("movements · mo")).toBeNull();
    expect(queryByText("active days · mo")).toBeNull();
    expect(queryByText("last moved")).toBeNull();
  });

  it("offers the 4-week / 90-day window toggle", async () => {
    const { getByText } = await render(<MovementScreen />);
    await waitFor(() => {
      expect(getByText("4 wks")).toBeTruthy();
      expect(getByText("90 d")).toBeTruthy();
    });
  });

  it("collapses each type into ONE rollup card (gym + padel), not a flat timeline", async () => {
    const { getByText, getByLabelText } = await render(<MovementScreen />);
    await waitFor(() => {
      expect(getByText("BY ACTIVITY")).toBeTruthy();
      // One Padel rollup + one Gym rollup, each tappable to expand.
      expect(getByLabelText(/^Padel, 1 in window/)).toBeTruthy();
      expect(getByLabelText(/^Gym, 1 in window/)).toBeTruthy();
    });
  });

  it("leads the padel rollup with Whoop strain", async () => {
    const { getByText } = await render(<MovementScreen />);
    await waitFor(() => {
      // avg strain headline (single padel @ 12.4) + its label.
      expect(getByText("12.4")).toBeTruthy();
      expect(getByText("avg strain")).toBeTruthy();
    });
  });

  it("expands a rollup and opens the activity edit sheet from a session row", async () => {
    const { getByLabelText, findByLabelText } = await render(<MovementScreen />);
    await waitFor(() => getByLabelText(/^Padel, 1 in window/));
    // Expand the Padel rollup, then tap its single session row.
    await fireEvent.press(getByLabelText(/^Padel, 1 in window/));
    const row = await findByLabelText(/^open /);
    await fireEvent.press(row);
    // The edit sheet's day stepper is up.
    expect(await findByLabelText("earlier day")).toBeTruthy();
  });

  it("expands the gym rollup and opens session detail from a session row", async () => {
    const { getByLabelText, findByLabelText } = await render(<MovementScreen />);
    await waitFor(() => getByLabelText(/^Gym, 1 in window/));
    await fireEvent.press(getByLabelText(/^Gym, 1 in window/));
    const row = await findByLabelText(/^open /);
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith("/(app)/strength/log/fixture-day1");
  });

  it("opens the library from the 'All exercises' row", async () => {
    const { getByLabelText } = await render(<MovementScreen />);
    await waitFor(() => getByLabelText("all exercises"));
    await fireEvent.press(getByLabelText("all exercises"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/strength/exercises");
  });

  it("shows an empty state when there are no sessions or activities", async () => {
    const overview = mockStrengthOverview();
    overview.sessions = [];
    mockFetchStrengthOverview.mockResolvedValue(overview);
    mockFetchActivities.mockResolvedValue([]);
    const { getByText } = await render(<MovementScreen />);
    await waitFor(() => {
      expect(getByText(/Nothing logged yet/)).toBeTruthy();
    });
  });

  it("still renders the gym scoreboard when activities fail to load", async () => {
    mockFetchActivities.mockRejectedValue(new Error("activities down"));
    const { getByText, getByLabelText } = await render(<MovementScreen />);
    await waitFor(() => {
      expect(getByText("BY ACTIVITY")).toBeTruthy();
      expect(getByLabelText(/^Gym, 1 in window/)).toBeTruthy();
    });
  });

  it("shows an error with retry when the overview fails", async () => {
    mockFetchStrengthOverview.mockRejectedValue(new Error("boom"));
    const { getByText } = await render(<MovementScreen />);
    await waitFor(() => {
      expect(getByText("Could not load movement data")).toBeTruthy();
      expect(getByText("Retry")).toBeTruthy();
    });
  });
});
