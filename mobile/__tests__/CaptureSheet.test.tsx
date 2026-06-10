// Component tests for the unified CaptureSheet — one sheet, no mode
// chooser. Covers: text-only routing, the recent-meals repeat row, search
// filtering, and the disabled-when-empty submit.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import type { Meal } from "../lib/types";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("expo-image-picker", () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async () => ({ uri: "file:///out.jpg", width: 100, height: 100 })),
  SaveFormat: { JPEG: "jpeg" },
}));

const mockFetchRecentMeals = jest.fn();
const mockRepeatMeal = jest.fn();

jest.mock("../lib/api", () => ({
  fetchRecentMeals: (...args: unknown[]) => mockFetchRecentMeals(...args),
  repeatMeal: (...args: unknown[]) => mockRepeatMeal(...args),
}));

import { CaptureSheet } from "../components/CaptureSheet";

function meal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "m1",
    created_at: Date.now(),
    photo_filename: null,
    items_json: JSON.stringify([
      { name: "Oats", grams: 80, confidence: "high", is_plant: true, per_100g: { sat_fat_g: 1, soluble_fiber_g: 4, calories: 380, protein_g: 13 } },
    ]),
    sat_fat_g: 1,
    soluble_fiber_g: 3,
    calories: 304,
    protein_g: 10,
    plant_pct: 100,
    notes: null,
    caption: "morning oats",
    meal_vibe: "fiber-friendly snack",
    ...overrides,
  };
}

describe("CaptureSheet", () => {
  beforeEach(() => {
    mockFetchRecentMeals.mockReset();
    mockRepeatMeal.mockReset();
    mockFetchRecentMeals.mockResolvedValue([]);
  });

  it("has no photo-vs-text mode chooser (one unified sheet)", async () => {
    const { queryByText } = await render(
      <CaptureSheet visible onClose={jest.fn()} onSubmit={jest.fn()} />
    );
    // The old chooser had "Photo" / "Text" tab labels.
    expect(queryByText("Text")).toBeNull();
  });

  it("submits text-only as a text capture", async () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = await render(
      <CaptureSheet visible onClose={jest.fn()} onSubmit={onSubmit} />
    );
    await fireEvent.changeText(
      getByPlaceholderText("describe what you ate, or add a photo…"),
      "a bowl of oatmeal"
    );
    await fireEvent.press(getByText("Log it"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "text", text: "a bowl of oatmeal" })
      );
    });
  });

  it("shows recent meals and repeats one with a single tap", async () => {
    mockFetchRecentMeals.mockResolvedValue([meal()]);
    mockRepeatMeal.mockResolvedValue(meal({ id: "m2", caption: "repeat of morning oats" }));
    const onRepeat = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = await render(
      <CaptureSheet visible onClose={onClose} onSubmit={jest.fn()} onRepeat={onRepeat} />
    );
    await waitFor(() => getByLabelText("log again: morning oats"));
    await fireEvent.press(getByLabelText("log again: morning oats"));
    await waitFor(() => {
      expect(mockRepeatMeal).toHaveBeenCalledWith("m1", { scale: 1, forDate: undefined });
      expect(onRepeat).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("filters the recent row by search", async () => {
    mockFetchRecentMeals.mockResolvedValue([
      meal({ id: "m1", caption: "morning oats" }),
      meal({ id: "m2", caption: "chicken salad" }),
    ]);
    const { getByPlaceholderText, queryByLabelText } = await render(
      <CaptureSheet visible onClose={jest.fn()} onSubmit={jest.fn()} />
    );
    await waitFor(() => expect(queryByLabelText("log again: morning oats")).toBeTruthy());
    await fireEvent.changeText(getByPlaceholderText("search recent meals…"), "chicken");
    await waitFor(() => {
      expect(queryByLabelText("log again: morning oats")).toBeNull();
      expect(queryByLabelText("log again: chicken salad")).toBeTruthy();
    });
  });

  it("routes to the composer when build-from-foods is tapped", async () => {
    const onCompose = jest.fn();
    const onClose = jest.fn();
    const { getByText } = await render(
      <CaptureSheet visible onClose={onClose} onSubmit={jest.fn()} onCompose={onCompose} />
    );
    await fireEvent.press(getByText("+ build from your foods"));
    await waitFor(() => {
      expect(onCompose).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
