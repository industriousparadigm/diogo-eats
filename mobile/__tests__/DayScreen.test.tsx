// Component tests for the Day screen (food tab).
// Tests: loading, empty, error, populated states + day navigation.
//
// @testing-library/react-native v14 notes:
// - render() is async — must be awaited.
// - fireEvent.press / fireEvent.changeText are async — must be awaited.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import type { Meal } from "../lib/types";

const mockPush = jest.fn();

// Mock expo-router (incl. useFocusEffect, which the screen uses to
// reload on focus — run it like a mount effect in tests).
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, navigate: jest.fn() }),
  useSegments: () => ["(app)"],
  useFocusEffect: (cb: () => void) => {
    const React = require("react");
    React.useEffect(() => {
      cb();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
  Stack: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock react-native-safe-area-context
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock expo-constants
jest.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        supabaseUrl: "https://test.supabase.co",
        supabaseAnonKey: "test-anon-key",
        apiBaseUrl: "https://test.vercel.app",
      },
    },
  },
}));

// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// Mock expo-image
jest.mock("expo-image", () => ({
  Image: "Image",
}));

// Mock expo-image-picker
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

// Mock expo-image-manipulator
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async (uri: string) => ({ uri })),
  SaveFormat: { JPEG: "jpeg" },
}));

// Mock supabase
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-token" } },
      })),
    },
  },
}));

const mockFetchMeals = jest.fn();
const mockDeleteMeal = jest.fn();
const mockFetchWhoopToday = jest.fn();
const mockGetSnapshot = jest.fn();
const mockSetSnapshot = jest.fn();

// Snapshot cache — controlled per-test so we can exercise cold cache
// (skeleton) vs cache-hit (instant data + silent refresh).
jest.mock("../lib/snapshot", () => ({
  getSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
  setSnapshot: (...args: unknown[]) => mockSetSnapshot(...args),
  snapshotKey: (ns: string, sub?: string) => (sub ? `${ns}.${sub}` : ns),
}));

// ApiError is defined inside the factory so it is available as the mock class.
jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    status?: number;
    constructor(code: string, message: string, status?: number) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.status = status;
    }
  }
  return {
    fetchMeals: (...args: unknown[]) => mockFetchMeals(...args),
    deleteMeal: (...args: unknown[]) => mockDeleteMeal(...args),
    parseMealPhoto: jest.fn(),
    parseMealText: jest.fn(),
    resolvePhotoUrl: jest.fn(async () => "https://example.com/photo.jpg"),
    fetchWhoopToday: (...args: unknown[]) => mockFetchWhoopToday(...args),
    syncWhoop: jest.fn(async () => {}),
    ApiError,
  };
});

function makeMeal(id: string, overrides: Partial<Meal> = {}): Meal {
  return {
    id,
    created_at: Date.now(),
    photo_filename: null,
    items_json: JSON.stringify([
      {
        name: "Oatmeal",
        grams: 200,
        confidence: "high" as const,
        is_plant: true,
        per_100g: { sat_fat_g: 0.8, soluble_fiber_g: 4, calories: 389, protein_g: 17 },
      },
    ]),
    sat_fat_g: 1.6,
    soluble_fiber_g: 8,
    calories: 778,
    protein_g: 34,
    plant_pct: 100,
    notes: null,
    caption: null,
    meal_vibe: "morning oats",
    ...overrides,
  };
}

import DayScreen from "../app/(app)/(tabs)/index";
import { ApiError as MockedApiError } from "../lib/api";
import { todayYmd, shiftYmd } from "../lib/format";

describe("DayScreen", () => {
  beforeEach(() => {
    mockFetchMeals.mockReset();
    mockDeleteMeal.mockReset();
    mockPush.mockReset();
    mockFetchWhoopToday.mockReset();
    mockFetchWhoopToday.mockResolvedValue({ connected: false });
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue(null); // cold cache by default
    mockSetSnapshot.mockReset();
  });

  it("shows loading state initially (before meals resolve)", async () => {
    mockFetchMeals.mockReturnValue(new Promise(() => {}));
    const { queryByText } = await render(<DayScreen />);
    expect(queryByText("Nothing logged yet")).toBeNull();
    expect(queryByText("Retry")).toBeNull();
  });

  it("shows a skeleton (not an empty state) while the first fetch is pending", async () => {
    mockFetchMeals.mockReturnValue(new Promise(() => {}));
    const { queryByText, findByLabelText } = await render(<DayScreen />);
    // The skeleton placeholder is present...
    expect(await findByLabelText("loading meals")).toBeTruthy();
    // ...and the empty copy is NOT shown before the fetch resolves.
    expect(queryByText("Nothing logged yet")).toBeNull();
  });

  it("renders cached meals immediately with no skeleton, then refreshes silently", async () => {
    const cached = [makeMeal("cached-1", { meal_vibe: "cached lunch" })];
    mockGetSnapshot.mockResolvedValue(cached);
    // Hold the fresh fetch open so the cached render is observable before
    // the silent reconcile lands.
    let resolveFresh: (m: Meal[]) => void = () => {};
    mockFetchMeals.mockReturnValue(
      new Promise<Meal[]>((res) => {
        resolveFresh = res;
      })
    );
    const { getByText, queryByLabelText } = await render(<DayScreen />);
    // Cached data shows first, with no skeleton (cache hit skips it).
    await waitFor(() => expect(getByText("cached lunch")).toBeTruthy());
    expect(queryByLabelText("loading meals")).toBeNull();
    // The silent refresh reconciles to fresh data when it lands.
    resolveFresh([makeMeal("fresh-1", { meal_vibe: "fresh dinner" })]);
    await waitFor(() => expect(getByText("fresh dinner")).toBeTruthy());
  });

  it("writes the snapshot after a successful fetch", async () => {
    const meals = [makeMeal("m-1")];
    mockFetchMeals.mockResolvedValue(meals);
    await render(<DayScreen />);
    await waitFor(() => {
      expect(mockSetSnapshot).toHaveBeenCalledWith("day", todayYmd(), expect.any(Array));
    });
  });

  it("shows empty state when no meals exist", async () => {
    mockFetchMeals.mockResolvedValue([]);
    const { getByText } = await render(<DayScreen />);
    await waitFor(() => {
      expect(getByText("Nothing logged yet")).toBeTruthy();
    });
  });

  it("shows error state and retry button on network failure", async () => {
    mockFetchMeals.mockRejectedValue(
      new MockedApiError("NETWORK_ERROR", "No network — check your connection")
    );
    const { getByText } = await render(<DayScreen />);
    await waitFor(() => {
      expect(getByText("No network — check your connection")).toBeTruthy();
      expect(getByText("Retry")).toBeTruthy();
    });
  });

  it("retries fetch when Retry is pressed", async () => {
    mockFetchMeals
      .mockRejectedValueOnce(
        new MockedApiError("NETWORK_ERROR", "No network — check your connection")
      )
      .mockResolvedValue([]);
    const { getByText } = await render(<DayScreen />);
    await waitFor(() => getByText("Retry"));
    await fireEvent.press(getByText("Retry"));
    await waitFor(() => {
      expect(getByText("Nothing logged yet")).toBeTruthy();
    });
    expect(mockFetchMeals.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("shows meal cards when meals are present", async () => {
    const meals = [makeMeal("meal-1"), makeMeal("meal-2", { meal_vibe: "lunch bowl" })];
    mockFetchMeals.mockResolvedValue(meals);
    const { getByText } = await render(<DayScreen />);
    await waitFor(() => {
      expect(getByText("morning oats")).toBeTruthy();
      expect(getByText("lunch bowl")).toBeTruthy();
    });
  });

  it("shows day totals strip when meals exist", async () => {
    mockFetchMeals.mockResolvedValue([makeMeal("meal-1")]);
    const { getByText, getAllByText } = await render(<DayScreen />);
    await waitFor(() => {
      // "kcal" now appears in both the totals strip and each meal card's
      // calorie badge unit (the styled card splits "590" from "kcal"); the
      // totals strip is the unique source of the "plant" label.
      expect(getAllByText("kcal").length).toBeGreaterThan(0);
      expect(getByText("plant")).toBeTruthy();
    });
  });

  it("does not show totals strip when no meals exist", async () => {
    mockFetchMeals.mockResolvedValue([]);
    const { getByText, queryByText } = await render(<DayScreen />);
    await waitFor(() => getByText("Nothing logged yet"));
    expect(queryByText("kcal")).toBeNull();
  });

  // ---- day navigation ----

  it("starts anchored on Today", async () => {
    mockFetchMeals.mockResolvedValue([]);
    const { getByText } = await render(<DayScreen />);
    await waitFor(() => {
      expect(getByText("Today")).toBeTruthy();
    });
    expect(mockFetchMeals).toHaveBeenCalledWith(todayYmd());
  });

  it("walks to Yesterday with the back chevron and fetches that day", async () => {
    mockFetchMeals.mockResolvedValue([]);
    const { getByText, getByLabelText } = await render(<DayScreen />);
    await waitFor(() => getByText("Today"));
    await fireEvent.press(getByLabelText("previous day"));
    await waitFor(() => {
      expect(getByText("Yesterday")).toBeTruthy();
    });
    expect(mockFetchMeals).toHaveBeenCalledWith(shiftYmd(todayYmd(), -1));
  });

  it("never walks past today with the forward chevron", async () => {
    mockFetchMeals.mockResolvedValue([]);
    const { getByText, getByLabelText } = await render(<DayScreen />);
    await waitFor(() => getByText("Today"));
    await fireEvent.press(getByLabelText("next day"));
    expect(getByText("Today")).toBeTruthy();
  });

  it("jumps back to today when the day label is tapped", async () => {
    mockFetchMeals.mockResolvedValue([]);
    const { getByText, getByLabelText } = await render(<DayScreen />);
    await waitFor(() => getByText("Today"));
    await fireEvent.press(getByLabelText("previous day"));
    await waitFor(() => getByText("Yesterday"));
    await fireEvent.press(getByLabelText("jump to today"));
    await waitFor(() => {
      expect(getByText("Today")).toBeTruthy();
    });
  });

  it("shows the past-day empty copy on a previous day", async () => {
    mockFetchMeals.mockResolvedValue([]);
    const { getByText, getByLabelText } = await render(<DayScreen />);
    await waitFor(() => getByText("Today"));
    await fireEvent.press(getByLabelText("previous day"));
    await waitFor(() => {
      expect(getByText("Nothing logged this day")).toBeTruthy();
    });
  });

  it("opens the meal edit screen when a meal is tapped", async () => {
    mockFetchMeals.mockResolvedValue([makeMeal("meal-1")]);
    const { getByText } = await render(<DayScreen />);
    await waitFor(() => getByText("morning oats"));
    await fireEvent.press(getByText("morning oats"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/meal/meal-1");
  });
});
