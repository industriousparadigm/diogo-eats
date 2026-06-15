// ScanScreenshotButton — pick a workout screenshot, parse it server-side,
// hand the parsed fields + stored filename up. Covers the happy path, a silent
// cancel, a denied permission, and a parse error.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
}));

const mockParse = jest.fn();
jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    parseActivityPhoto: (...args: unknown[]) => mockParse(...args),
    ApiError,
  };
});

import { ScanScreenshotButton } from "../components/ScanScreenshotButton";

const PARSED = {
  type: "run",
  distance_km: 8.2,
  duration_min: 47,
  surface: "trail",
  elevation_m: 312,
  started_at: null,
  avg_pace_per_km: "5:44",
  confidence: "high" as const,
  summary: "8.2 km trail run, 47 min, 312 m gain",
};

const lib = ImagePicker.launchImageLibraryAsync as jest.Mock;
const perm = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;

describe("ScanScreenshotButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    perm.mockResolvedValue({ status: "granted" });
  });

  it("picks an image, parses it, and calls onParsed with the parsed fields + filename", async () => {
    lib.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///s.jpg", fileName: "s.jpg", mimeType: "image/jpeg" }],
    });
    mockParse.mockResolvedValue({ parsed: PARSED, photo_filename: "abcd1234.jpg" });
    const onParsed = jest.fn();
    const { getByLabelText } = await render(<ScanScreenshotButton onParsed={onParsed} />);
    await fireEvent.press(getByLabelText("scan screenshot"));
    await waitFor(() => expect(onParsed).toHaveBeenCalledWith(PARSED, "abcd1234.jpg"));
    expect(mockParse).toHaveBeenCalledWith({
      uri: "file:///s.jpg",
      name: "s.jpg",
      type: "image/jpeg",
    });
  });

  it("is a silent no-op when the picker is cancelled", async () => {
    lib.mockResolvedValue({ canceled: true, assets: [] });
    const onParsed = jest.fn();
    const { getByLabelText } = await render(<ScanScreenshotButton onParsed={onParsed} />);
    await fireEvent.press(getByLabelText("scan screenshot"));
    await waitFor(() => expect(lib).toHaveBeenCalled());
    expect(mockParse).not.toHaveBeenCalled();
    expect(onParsed).not.toHaveBeenCalled();
  });

  it("shows an error when photo permission is denied", async () => {
    perm.mockResolvedValue({ status: "denied" });
    const { getByLabelText, findByText } = await render(<ScanScreenshotButton onParsed={jest.fn()} />);
    await fireEvent.press(getByLabelText("scan screenshot"));
    expect(await findByText(/permission/)).toBeTruthy();
    expect(lib).not.toHaveBeenCalled();
  });

  it("surfaces a parse error without crashing", async () => {
    lib.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///s.jpg" }] });
    mockParse.mockRejectedValue(new Error("overloaded"));
    const onParsed = jest.fn();
    const { getByLabelText, findByText } = await render(<ScanScreenshotButton onParsed={onParsed} />);
    await fireEvent.press(getByLabelText("scan screenshot"));
    expect(await findByText(/couldn't read/)).toBeTruthy();
    expect(onParsed).not.toHaveBeenCalled();
  });
});
