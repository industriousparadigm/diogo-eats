// Component tests for the Foods library screen — search, list with
// provenance badges, manual add, edit, delete, and the label-photo entry.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { Food } from "../lib/foods";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-image-picker", () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async () => ({ uri: "file:///out.jpg", width: 100, height: 100 })),
  SaveFormat: { JPEG: "jpeg" },
}));

const mockFetchFoods = jest.fn();
const mockCreateFood = jest.fn();
const mockUpdateFood = jest.fn();
const mockDeleteFood = jest.fn();
const mockMergeFoods = jest.fn();
const mockFoodFromLabel = jest.fn();

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
    createFood: (...args: unknown[]) => mockCreateFood(...args),
    updateFood: (...args: unknown[]) => mockUpdateFood(...args),
    deleteFood: (...args: unknown[]) => mockDeleteFood(...args),
    mergeFoods: (...args: unknown[]) => mockMergeFoods(...args),
    foodFromLabel: (...args: unknown[]) => mockFoodFromLabel(...args),
    ApiError,
  };
});

import FoodsScreen from "../app/(app)/foods";

function food(overrides: Partial<Food> = {}): Food {
  return {
    name_key: "oat milk",
    display_name: "Oat milk",
    is_plant: 1,
    per_100g_json: JSON.stringify({ sat_fat_g: 0.3, soluble_fiber_g: 0.8, calories: 46, protein_g: 1 }),
    times_seen: 12,
    last_seen: Date.now(),
    provenance: "label_verified",
    portion_presets: null,
    ...overrides,
  };
}

describe("FoodsScreen", () => {
  beforeEach(() => {
    mockFetchFoods.mockReset();
    mockCreateFood.mockReset();
    mockUpdateFood.mockReset();
    mockDeleteFood.mockReset();
    mockMergeFoods.mockReset();
    mockFoodFromLabel.mockReset();
    mockFetchFoods.mockResolvedValue([food()]);
  });

  it("lists foods with a plain-language provenance badge", async () => {
    const { getByText } = await render(<FoodsScreen />);
    await waitFor(() => {
      expect(getByText(/Oat milk/)).toBeTruthy();
      expect(getByText("from label")).toBeTruthy();
    });
  });

  it("searches by query", async () => {
    const { getByLabelText } = await render(<FoodsScreen />);
    await waitFor(() => expect(mockFetchFoods).toHaveBeenCalled());
    mockFetchFoods.mockClear();
    await fireEvent.changeText(getByLabelText("search foods"), "oat");
    await waitFor(() => {
      expect(mockFetchFoods).toHaveBeenCalledWith("oat", { limit: 100 });
    });
  });

  it("adds a food manually", async () => {
    mockCreateFood.mockResolvedValue(food({ name_key: "new" }));
    const { getByLabelText, getByText } = await render(<FoodsScreen />);
    await waitFor(() => getByText("+ add food"));
    await fireEvent.press(getByText("+ add food"));
    await fireEvent.changeText(getByLabelText("food name"), "Provamel oat milk");
    await fireEvent.changeText(getByLabelText("kcal per 100g"), "46");
    await fireEvent.press(getByText("add"));
    await waitFor(() => {
      expect(mockCreateFood).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: "Provamel oat milk", is_plant: true })
      );
    });
  });

  it("edits a food's nutrition", async () => {
    mockUpdateFood.mockResolvedValue(food());
    const { getByText, getByLabelText } = await render(<FoodsScreen />);
    await waitFor(() => getByText("edit"));
    await fireEvent.press(getByText("edit"));
    await fireEvent.changeText(getByLabelText("kcal per 100g"), "50");
    await fireEvent.press(getByText("save"));
    await waitFor(() => {
      expect(mockUpdateFood).toHaveBeenCalledWith(
        "oat milk",
        expect.objectContaining({ display_name: "Oat milk" })
      );
    });
  });

  it("deletes a food after confirm", async () => {
    mockDeleteFood.mockResolvedValue(undefined);
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, btns) => {
        const del = (btns ?? []).find((b) => b.text === "Delete");
        del?.onPress?.();
      });
    const { getByText } = await render(<FoodsScreen />);
    await waitFor(() => getByText("edit"));
    await fireEvent.press(getByText("edit"));
    await fireEvent.press(getByText("delete"));
    await waitFor(() => {
      expect(mockDeleteFood).toHaveBeenCalledWith("oat milk");
    });
    alertSpy.mockRestore();
  });

  it("reads a label via the camera entry", async () => {
    const ImagePicker = require("expo-image-picker");
    ImagePicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///label.jpg" }],
    });
    mockFoodFromLabel.mockResolvedValue(food({ name_key: "labelled" }));
    const { getByText } = await render(<FoodsScreen />);
    await waitFor(() => getByText("read a label"));
    await fireEvent.press(getByText("read a label"));
    await waitFor(() => {
      expect(mockFoodFromLabel).toHaveBeenCalled();
    });
  });
});
