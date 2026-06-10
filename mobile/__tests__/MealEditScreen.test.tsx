// Component tests for the meal detail/edit screen — items editing with
// live totals, talk-to-fix, add/remove item, save semantics.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import type { Meal, Item } from "../lib/types";

const mockBack = jest.fn();
let mockParams: { id?: string } = { id: "meal-1" };

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-token" } },
      })),
    },
  },
}));

const mockPatchMealItems = jest.fn();
const mockTalkFixMeal = jest.fn();
const mockLookupFood = jest.fn();
const mockDeleteMeal = jest.fn();

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
    patchMealItems: (...args: unknown[]) => mockPatchMealItems(...args),
    talkFixMeal: (...args: unknown[]) => mockTalkFixMeal(...args),
    lookupFood: (...args: unknown[]) => mockLookupFood(...args),
    deleteMeal: (...args: unknown[]) => mockDeleteMeal(...args),
    resolvePhotoUrl: jest.fn(async () => "https://example.com/photo.jpg"),
    ApiError,
  };
});

import MealEditScreen from "../app/(app)/meal/[id]";
import { stashMeal } from "../lib/stores";

function oatmeal(grams = 200): Item {
  return {
    name: "Oatmeal",
    grams,
    confidence: "high",
    is_plant: true,
    per_100g: { sat_fat_g: 1, soluble_fiber_g: 4, calories: 380, protein_g: 13 },
  };
}

function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "meal-1",
    created_at: new Date(2026, 5, 10, 12, 30).getTime(),
    photo_filename: null,
    items_json: JSON.stringify([oatmeal()]),
    sat_fat_g: 2,
    soluble_fiber_g: 8,
    calories: 760,
    protein_g: 26,
    plant_pct: 100,
    notes: null,
    caption: null,
    meal_vibe: "morning oats",
    ...overrides,
  };
}

describe("MealEditScreen", () => {
  beforeEach(() => {
    mockParams = { id: "meal-1" };
    mockPatchMealItems.mockReset();
    mockTalkFixMeal.mockReset();
    mockLookupFood.mockReset();
    mockDeleteMeal.mockReset();
    mockBack.mockReset();
  });

  it("renders the meal's vibe and items", async () => {
    stashMeal(makeMeal());
    const { getByText, getByDisplayValue } = await render(<MealEditScreen />);
    expect(getByText("morning oats")).toBeTruthy();
    expect(getByDisplayValue("Oatmeal")).toBeTruthy();
    expect(getByDisplayValue("200")).toBeTruthy();
  });

  it("shows live totals that update when grams change", async () => {
    stashMeal(makeMeal());
    const { getByText, getByLabelText } = await render(<MealEditScreen />);
    expect(getByText("760")).toBeTruthy(); // 380 * 2
    await fireEvent.changeText(getByLabelText("Oatmeal grams"), "100");
    await waitFor(() => {
      expect(getByText("380")).toBeTruthy();
    });
  });

  it("disables save until something changes", async () => {
    stashMeal(makeMeal());
    const { getByText, getByLabelText } = await render(<MealEditScreen />);
    expect(getByText("no changes")).toBeTruthy();
    await fireEvent.changeText(getByLabelText("Oatmeal grams"), "150");
    await waitFor(() => {
      expect(getByText("save")).toBeTruthy();
    });
  });

  it("saves edited items via PATCH and navigates back", async () => {
    stashMeal(makeMeal());
    mockPatchMealItems.mockResolvedValue(makeMeal());
    const { getByText, getByLabelText } = await render(<MealEditScreen />);
    await fireEvent.changeText(getByLabelText("Oatmeal grams"), "150");
    await waitFor(() => getByText("save"));
    await fireEvent.press(getByText("save"));
    await waitFor(() => {
      expect(mockPatchMealItems).toHaveBeenCalledWith("meal-1", [
        expect.objectContaining({ name: "Oatmeal", grams: 150 }),
      ]);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it("removes an item", async () => {
    stashMeal(
      makeMeal({ items_json: JSON.stringify([oatmeal(), { ...oatmeal(), name: "Banana" }]) })
    );
    const { getByLabelText, queryByDisplayValue } = await render(<MealEditScreen />);
    await fireEvent.press(getByLabelText("remove Banana"));
    await waitFor(() => {
      expect(queryByDisplayValue("Banana")).toBeNull();
    });
  });

  it("talk-to-fix rewrites items for review without saving", async () => {
    stashMeal(makeMeal());
    mockTalkFixMeal.mockResolvedValue([{ ...oatmeal(), name: "Oatmeal with chia" }]);
    const { getByText, getByLabelText, getByDisplayValue } = await render(
      <MealEditScreen />
    );
    await fireEvent.changeText(
      getByLabelText("talk to fix message"),
      "I added chia seeds"
    );
    await fireEvent.press(getByText("fix it"));
    await waitFor(() => {
      expect(mockTalkFixMeal).toHaveBeenCalledWith("meal-1", "I added chia seeds");
      expect(getByDisplayValue("Oatmeal with chia")).toBeTruthy();
      expect(getByText("updated — review, then save")).toBeTruthy();
    });
    // Not saved yet — only the working copy changed.
    expect(mockPatchMealItems).not.toHaveBeenCalled();
  });

  it("adds an item via nutrition lookup", async () => {
    stashMeal(makeMeal());
    mockLookupFood.mockResolvedValue({
      is_plant: true,
      per_100g: { sat_fat_g: 14, soluble_fiber_g: 0, calories: 884, protein_g: 0 },
    });
    const { getByText, getByLabelText, getByDisplayValue } = await render(
      <MealEditScreen />
    );
    await fireEvent.press(getByText("+ add item"));
    await fireEvent.changeText(getByLabelText("new item name"), "olive oil");
    await fireEvent.changeText(getByLabelText("new item grams"), "10");
    await fireEvent.press(getByText("add"));
    await waitFor(() => {
      expect(mockLookupFood).toHaveBeenCalledWith("olive oil");
      expect(getByDisplayValue("olive oil")).toBeTruthy();
    });
  });

  it("guards legacy meals from editing", async () => {
    stashMeal(
      makeMeal({
        items_json: JSON.stringify([{ name: "Old meal", grams: 300 }]),
      })
    );
    const { getByText, queryByText } = await render(<MealEditScreen />);
    expect(
      getByText("This meal predates per-item nutrition. Delete and re-log to edit.")
    ).toBeTruthy();
    expect(queryByText("fix it")).toBeNull();
  });

  it("shows a not-found state when the meal isn't stashed", async () => {
    mockParams = { id: "unknown-meal" };
    const { getByText } = await render(<MealEditScreen />);
    expect(getByText("Meal not found")).toBeTruthy();
  });
});
