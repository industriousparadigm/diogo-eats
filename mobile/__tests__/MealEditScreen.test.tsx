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

// MealPhotoSheet pulls these for the camera/library pick paths. The tests
// drive the attach flow through the sheet's pick buttons, so the pickers
// return a canned asset and the manipulator is a passthrough resize.
const mockLaunchCamera = jest.fn();
const mockLaunchLibrary = jest.fn();
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCamera(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async (uri: string) => ({ uri, width: 2048, height: 1536 })),
  SaveFormat: { JPEG: "jpeg" },
}));
// The crop sheet's gestures aren't under test here — stub it so a library
// pick can resolve without the gesture-handler tree.
jest.mock("../components/PhotoCropSheet", () => ({
  PhotoCropSheet: () => null,
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
const mockAttachMealPhoto = jest.fn();
const mockRemoveMealPhoto = jest.fn();

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
    attachMealPhoto: (...args: unknown[]) => mockAttachMealPhoto(...args),
    removeMealPhoto: (...args: unknown[]) => mockRemoveMealPhoto(...args),
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
    mockAttachMealPhoto.mockReset();
    mockRemoveMealPhoto.mockReset();
    mockLaunchCamera.mockReset();
    mockLaunchLibrary.mockReset();
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
    const { getAllByText, getByLabelText } = await render(<MealEditScreen />);
    // 380 * 2 — calories now appear in both the headline strip AND the
    // nutrition panel, so there are two matches.
    expect(getAllByText("760").length).toBeGreaterThan(0);
    await fireEvent.changeText(getByLabelText("Oatmeal grams"), "100");
    await waitFor(() => {
      expect(getAllByText("380").length).toBeGreaterThan(0);
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

// A meal item carrying the full silent-capture nutrient set. Round
// numbers per 100g so a 100g portion (f=1) reports the per_100g value
// straight, keeping the assertions readable.
function fullItem(overrides: Partial<Item> = {}): Item {
  return {
    name: "Cheese pizza",
    grams: 100,
    confidence: "high",
    is_plant: false,
    per_100g: {
      sat_fat_g: 6,
      soluble_fiber_g: 2,
      calories: 270,
      protein_g: 12,
      fat_g: 10,
      carbs_g: 33,
      sugar_g: 4,
      salt_g: 1.2,
      alcohol_g: 0,
    },
    ...overrides,
  };
}

describe("MealEditScreen — NUTRITION panel", () => {
  beforeEach(() => {
    mockParams = { id: "meal-1" };
  });

  it("renders every tracked metric for a fully-loaded meal", async () => {
    stashMeal(makeMeal({ items_json: JSON.stringify([fullItem()]) }));
    const { getByText } = await render(<MealEditScreen />);
    // The panel header and each metric's label appear.
    expect(getByText("NUTRITION")).toBeTruthy();
    expect(getByText("calories")).toBeTruthy();
    expect(getByText("protein")).toBeTruthy();
    expect(getByText("total fat")).toBeTruthy();
    expect(getByText("sat fat")).toBeTruthy();
    expect(getByText("carbs")).toBeTruthy();
    expect(getByText("sugar")).toBeTruthy();
    expect(getByText("soluble fiber")).toBeTruthy();
    expect(getByText("salt")).toBeTruthy();
    // Values for the silent nutrients are computed, not "—".
    expect(getByText("10.0g")).toBeTruthy(); // total fat
    expect(getByText("33.0g")).toBeTruthy(); // carbs
    expect(getByText("4.0g")).toBeTruthy(); // sugar
    expect(getByText("1.2g")).toBeTruthy(); // salt
  });

  it("hides the alcohol row when the meal carries no alcohol", async () => {
    // alcohol_g present on the item but summing to 0 — still hidden.
    stashMeal(makeMeal({ items_json: JSON.stringify([fullItem()]) }));
    const { queryByText } = await render(<MealEditScreen />);
    expect(queryByText("alcohol")).toBeNull();
  });

  it("shows the alcohol row when the meal contains alcohol", async () => {
    stashMeal(
      makeMeal({
        items_json: JSON.stringify([
          fullItem({
            name: "Red wine",
            grams: 100,
            per_100g: { ...fullItem().per_100g, alcohol_g: 11 },
          }),
        ]),
      })
    );
    const { getByText } = await render(<MealEditScreen />);
    expect(getByText("alcohol")).toBeTruthy();
    expect(getByText("11.0g")).toBeTruthy();
  });

  it("renders '—' for a silent nutrient no item carries, not 0.0g", async () => {
    // oatmeal() carries only the four core nutrients — fat/carbs/sugar/
    // salt are absent. They must show '—', distinct from a computed zero.
    stashMeal(makeMeal()); // items_json = [oatmeal()]
    const { getAllByText, getByText } = await render(<MealEditScreen />);
    // Four absent silent metrics each render the em-dash placeholder.
    expect(getAllByText("—").length).toBe(4);
    // The core metrics that ARE present still show real numbers — protein's
    // "26.0g" is panel-unique (the headline strip shows the 0-decimal "26g").
    expect(getByText("26.0g")).toBeTruthy(); // protein
  });

  it("distinguishes a computed zero from absence", async () => {
    // sugar_g present and equal to 0 → "0.0g" (a real measurement), while
    // an item lacking carbs entirely contributes absence.
    stashMeal(
      makeMeal({
        items_json: JSON.stringify([
          {
            name: "Plain chicken",
            grams: 100,
            confidence: "high",
            is_plant: false,
            per_100g: {
              sat_fat_g: 1,
              soluble_fiber_g: 2, // nonzero so it doesn't collide with sugar's 0.0g
              calories: 165,
              protein_g: 31,
              sugar_g: 0, // present, measured zero
              // fat_g/carbs_g/salt_g absent
            },
          },
        ]),
      })
    );
    const { getByText, getAllByText } = await render(<MealEditScreen />);
    expect(getByText("0.0g")).toBeTruthy(); // sugar — a real zero
    // fat, carbs, salt absent → three em-dashes.
    expect(getAllByText("—").length).toBe(3);
  });

  it("recomputes the panel live when grams change", async () => {
    stashMeal(makeMeal({ items_json: JSON.stringify([fullItem()]) }));
    const { getByText, getByLabelText, queryByText } = await render(
      <MealEditScreen />
    );
    expect(getByText("10.0g")).toBeTruthy(); // total fat at 100g
    await fireEvent.changeText(getByLabelText("Cheese pizza grams"), "200");
    await waitFor(() => {
      expect(getByText("20.0g")).toBeTruthy(); // total fat doubles at 200g
    });
    expect(queryByText("10.0g")).toBeNull();
  });
});

describe("MealEditScreen — attach / replace / remove photo", () => {
  beforeEach(() => {
    mockParams = { id: "meal-1" };
    mockAttachMealPhoto.mockReset();
    mockRemoveMealPhoto.mockReset();
    mockLaunchCamera.mockReset();
    mockLaunchLibrary.mockReset();
  });

  it("shows the add-photo affordance on a text-logged meal (no photo)", async () => {
    stashMeal(makeMeal({ photo_filename: null }));
    const { getByLabelText, queryByLabelText } = await render(<MealEditScreen />);
    expect(getByLabelText("add a photo")).toBeTruthy();
    // No image / replace affordance when there's nothing to replace.
    expect(queryByLabelText("replace photo")).toBeNull();
  });

  it("attaches a library photo and transitions none → present", async () => {
    stashMeal(makeMeal({ photo_filename: null }));
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/picked.jpg" }],
    });
    mockAttachMealPhoto.mockResolvedValue(
      makeMeal({ photo_filename: "fresh16hexname01.jpg" })
    );
    // PhotoCropSheet is stubbed to null, so a library pick can't auto-resolve
    // the crop in this harness — exercise the attach by driving the sheet's
    // onPicked directly via the camera path (native crop, no in-app sheet).
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/shot.jpg" }],
    });

    const { getByLabelText, queryByLabelText } = await render(<MealEditScreen />);
    // Open the sheet from the add affordance, then take a photo (camera path
    // hands the resolved photo straight to onPicked → attach).
    await fireEvent.press(getByLabelText("add a photo"));
    await fireEvent.press(getByLabelText("take a photo"));

    await waitFor(() => {
      expect(mockAttachMealPhoto).toHaveBeenCalledWith(
        "meal-1",
        expect.objectContaining({ type: "image/jpeg" })
      );
    });
    // Present state: the replace affordance now exists; the add slot is gone.
    await waitFor(() => {
      expect(getByLabelText("replace photo")).toBeTruthy();
    });
    expect(queryByLabelText("add a photo")).toBeNull();
  });

  it("offers replace + remove when a photo already exists", async () => {
    stashMeal(makeMeal({ photo_filename: "existing0123456a.jpg" }));
    const { getByLabelText } = await render(<MealEditScreen />);
    await waitFor(() => expect(getByLabelText("replace photo")).toBeTruthy());
    // Opening the replace sheet reveals the remove affordance.
    await fireEvent.press(getByLabelText("replace photo"));
    expect(getByLabelText("remove photo")).toBeTruthy();
  });

  it("removes the photo and returns to the add state", async () => {
    stashMeal(makeMeal({ photo_filename: "existing0123456a.jpg" }));
    mockRemoveMealPhoto.mockResolvedValue(makeMeal({ photo_filename: null }));
    const { getByLabelText, queryByLabelText } = await render(<MealEditScreen />);
    await waitFor(() => expect(getByLabelText("replace photo")).toBeTruthy());
    await fireEvent.press(getByLabelText("replace photo"));
    await fireEvent.press(getByLabelText("remove photo"));
    await waitFor(() => {
      expect(mockRemoveMealPhoto).toHaveBeenCalledWith("meal-1");
      expect(getByLabelText("add a photo")).toBeTruthy();
    });
    expect(queryByLabelText("replace photo")).toBeNull();
  });
});
