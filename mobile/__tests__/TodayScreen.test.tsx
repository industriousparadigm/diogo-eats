// Component tests for the Today screen.
// Tests: loading state, empty state, error state, populated state.
//
// @testing-library/react-native v14 notes:
// - render() is async — must be awaited.
// - fireEvent.press / fireEvent.changeText are async — must be awaited.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import type { Meal } from "../lib/types";

// Mock expo-router
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSegments: () => ["(app)"],
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

// ApiError is defined inside the factory so it is available as the mock class.
// The tests then import the same mock and use it to instantiate errors.
jest.mock("../lib/api", () => {
  // Define ApiError inline so it is available as the exported class.
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

import TodayScreen from "../app/(app)/today";
import { ApiError as MockedApiError } from "../lib/api";

describe("TodayScreen", () => {
  beforeEach(() => {
    mockFetchMeals.mockReset();
    mockDeleteMeal.mockReset();
  });

  it("shows loading state initially (before meals resolve)", async () => {
    mockFetchMeals.mockReturnValue(new Promise(() => {}));
    const { queryByText } = await render(<TodayScreen />);
    expect(queryByText("Nothing logged yet")).toBeNull();
    expect(queryByText("Retry")).toBeNull();
  });

  it("shows empty state when no meals exist", async () => {
    mockFetchMeals.mockResolvedValue([]);
    const { getByText } = await render(<TodayScreen />);
    await waitFor(() => {
      expect(getByText("Nothing logged yet")).toBeTruthy();
    });
  });

  it("shows error state and retry button on network failure", async () => {
    mockFetchMeals.mockRejectedValue(
      new MockedApiError("NETWORK_ERROR", "No network — check your connection")
    );
    const { getByText } = await render(<TodayScreen />);
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
      .mockResolvedValueOnce([]);
    const { getByText } = await render(<TodayScreen />);
    await waitFor(() => getByText("Retry"));
    await fireEvent.press(getByText("Retry"));
    await waitFor(() => {
      expect(getByText("Nothing logged yet")).toBeTruthy();
    });
    expect(mockFetchMeals).toHaveBeenCalledTimes(2);
  });

  it("shows meal cards when meals are present", async () => {
    const meals = [makeMeal("meal-1"), makeMeal("meal-2", { meal_vibe: "lunch bowl" })];
    mockFetchMeals.mockResolvedValue(meals);
    const { getByText } = await render(<TodayScreen />);
    await waitFor(() => {
      expect(getByText("morning oats")).toBeTruthy();
      expect(getByText("lunch bowl")).toBeTruthy();
    });
  });

  it("shows day totals strip when meals exist", async () => {
    mockFetchMeals.mockResolvedValue([makeMeal("meal-1")]);
    const { getByText } = await render(<TodayScreen />);
    await waitFor(() => {
      expect(getByText("kcal")).toBeTruthy();
      expect(getByText("plant")).toBeTruthy();
    });
  });

  it("does not show totals strip when no meals exist", async () => {
    mockFetchMeals.mockResolvedValue([]);
    const { getByText, queryByText } = await render(<TodayScreen />);
    await waitFor(() => getByText("Nothing logged yet"));
    expect(queryByText("kcal")).toBeNull();
  });
});
