// Component tests for the Composer screen — search → add → grams → live
// totals → save. Zero-AI deterministic lane.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import type { Food } from "../lib/foods";

const mockBack = jest.fn();
let mockParams: { date?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockFetchFoods = jest.fn();
const mockComposeMeal = jest.fn();

jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    fetchFoods: (...args: unknown[]) => mockFetchFoods(...args),
    composeMeal: (...args: unknown[]) => mockComposeMeal(...args),
    ApiError,
  };
});

import ComposeScreen from "../app/(app)/compose";
import { takeNewMeal } from "../lib/stores";

function food(overrides: Partial<Food> = {}): Food {
  return {
    name_key: "oats",
    display_name: "Oats",
    is_plant: 1,
    per_100g_json: JSON.stringify({ sat_fat_g: 1.2, soluble_fiber_g: 4, calories: 380, protein_g: 13 }),
    times_seen: 5,
    last_seen: Date.now(),
    provenance: "user_corrected",
    portion_presets: null,
    ...overrides,
  };
}

describe("ComposeScreen", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockFetchFoods.mockReset();
    mockComposeMeal.mockReset();
    mockParams = {};
    takeNewMeal(); // drain any stash from a prior test
  });

  it("searches the library and adds a food line with live totals", async () => {
    mockFetchFoods.mockResolvedValue([food()]);
    const { getByLabelText, getByText } = await render(<ComposeScreen />);
    await fireEvent.changeText(getByLabelText("search foods"), "oat");
    await waitFor(() => getByLabelText("add Oats"));
    await fireEvent.press(getByLabelText("add Oats"));
    // Default 100g of Oats → 380 kcal in the totals strip.
    await waitFor(() => {
      expect(getByText("380")).toBeTruthy();
    });
  });

  it("uses a portion preset as the default grams when present", async () => {
    mockFetchFoods.mockResolvedValue([
      food({ portion_presets: [{ label: "slice", grams: 50 }] }),
    ]);
    const { getByLabelText, getByDisplayValue } = await render(<ComposeScreen />);
    await fireEvent.changeText(getByLabelText("search foods"), "oat");
    await waitFor(() => getByLabelText("add Oats"));
    await fireEvent.press(getByLabelText("add Oats"));
    await waitFor(() => {
      expect(getByDisplayValue("50")).toBeTruthy();
    });
  });

  it("saves a composed meal and stashes it for the food tab", async () => {
    mockFetchFoods.mockResolvedValue([food()]);
    mockComposeMeal.mockResolvedValue({ id: "composed-1", calories: 380 });
    const { getByLabelText, getByText } = await render(<ComposeScreen />);
    await fireEvent.changeText(getByLabelText("search foods"), "oat");
    await waitFor(() => getByLabelText("add Oats"));
    await fireEvent.press(getByLabelText("add Oats"));
    await fireEvent.press(getByText("save meal"));
    await waitFor(() => {
      expect(mockComposeMeal).toHaveBeenCalledWith(
        [{ food_id: "oats", grams: 100 }],
        { forDate: undefined }
      );
      expect(mockBack).toHaveBeenCalled();
    });
    const stashed = takeNewMeal();
    expect(stashed?.meal.id).toBe("composed-1");
  });

  it("backfills onto a past day when ?date is set", async () => {
    mockParams = { date: "2026-06-01" };
    mockFetchFoods.mockResolvedValue([food()]);
    mockComposeMeal.mockResolvedValue({ id: "composed-2", calories: 380 });
    const { getByLabelText, getByText } = await render(<ComposeScreen />);
    await fireEvent.changeText(getByLabelText("search foods"), "oat");
    await waitFor(() => getByLabelText("add Oats"));
    await fireEvent.press(getByLabelText("add Oats"));
    await fireEvent.press(getByText("save for that day"));
    await waitFor(() => {
      expect(mockComposeMeal).toHaveBeenCalledWith(
        [{ food_id: "oats", grams: 100 }],
        { forDate: "2026-06-01" }
      );
    });
    const stashed = takeNewMeal();
    expect(stashed?.day).toBe("2026-06-01");
  });
});
