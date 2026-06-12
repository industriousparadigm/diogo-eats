// Component tests for MealPhotoSheet — the single-photo attach/replace
// sheet used from the meal detail screen. Covers the add vs replace copy,
// the remove affordance gating, and that camera/library picks resolve a
// photo back to the parent (the visual-record-only flow; no re-parse).

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

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
jest.mock("../components/PhotoCropSheet", () => ({
  PhotoCropSheet: () => null,
}));

import { MealPhotoSheet } from "../components/MealPhotoSheet";

describe("MealPhotoSheet", () => {
  beforeEach(() => {
    mockLaunchCamera.mockReset();
    mockLaunchLibrary.mockReset();
  });

  it("reads 'Add photo' with no remove row when the meal has no photo", async () => {
    const { getByText, queryByLabelText } = await render(
      <MealPhotoSheet
        visible
        hasPhoto={false}
        onClose={jest.fn()}
        onPicked={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(getByText("Add photo")).toBeTruthy();
    expect(queryByLabelText("remove photo")).toBeNull();
  });

  it("reads 'Replace photo' and shows the remove row when a photo exists", async () => {
    const { getByText, getByLabelText } = await render(
      <MealPhotoSheet
        visible
        hasPhoto
        onClose={jest.fn()}
        onPicked={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(getByText("Replace photo")).toBeTruthy();
    expect(getByLabelText("remove photo")).toBeTruthy();
  });

  it("states plainly that a photo won't change the meal's numbers", async () => {
    const { getByText } = await render(
      <MealPhotoSheet visible hasPhoto={false} onClose={jest.fn()} onPicked={jest.fn()} />
    );
    expect(
      getByText(/visual record only.*won't change this meal's items/i)
    ).toBeTruthy();
  });

  it("hands a camera shot to onPicked (native crop path)", async () => {
    const onPicked = jest.fn();
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/shot.jpg" }],
    });
    const { getByLabelText } = await render(
      <MealPhotoSheet visible hasPhoto={false} onClose={jest.fn()} onPicked={onPicked} />
    );
    await fireEvent.press(getByLabelText("take a photo"));
    await waitFor(() => {
      expect(onPicked).toHaveBeenCalledWith(
        expect.objectContaining({ uri: "file:///tmp/shot.jpg", type: "image/jpeg" })
      );
    });
  });

  it("does not call onPicked when the picker is canceled", async () => {
    const onPicked = jest.fn();
    mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: [] });
    const { getByLabelText } = await render(
      <MealPhotoSheet visible hasPhoto={false} onClose={jest.fn()} onPicked={onPicked} />
    );
    await fireEvent.press(getByLabelText("pick from library"));
    await waitFor(() => {
      expect(mockLaunchLibrary).toHaveBeenCalled();
    });
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("fires onRemove (and closes) from the remove row", async () => {
    const onRemove = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = await render(
      <MealPhotoSheet visible hasPhoto onClose={onClose} onPicked={jest.fn()} onRemove={onRemove} />
    );
    fireEvent.press(getByLabelText("remove photo"));
    expect(onRemove).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
