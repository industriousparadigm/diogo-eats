// Component tests for the Settings tab — DB-backed targets, save,
// reset-to-defaults, and the account section.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn() }),
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

const mockSignOut = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { user: { email: "diogo@example.com" } } },
      })),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  },
}));

const mockFetchProfile = jest.fn();
const mockSaveTargets = jest.fn();

jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
    saveTargets: (...args: unknown[]) => mockSaveTargets(...args),
    ApiError,
  };
});

import SettingsScreen from "../app/(app)/(tabs)/settings";

describe("SettingsScreen", () => {
  beforeEach(() => {
    mockFetchProfile.mockReset();
    mockSaveTargets.mockReset();
    mockSignOut.mockReset();
    mockFetchProfile.mockResolvedValue({
      sat_fat_g: 18,
      soluble_fiber_g: 10,
      calories: 2000,
      protein_g: 90,
      email: "diogo@example.com",
    });
    mockSaveTargets.mockResolvedValue(undefined);
  });

  it("loads the 4 targets from the profile", async () => {
    const { getByDisplayValue } = await render(<SettingsScreen />);
    await waitFor(() => {
      expect(getByDisplayValue("18")).toBeTruthy();
      expect(getByDisplayValue("10")).toBeTruthy();
      expect(getByDisplayValue("2000")).toBeTruthy();
      expect(getByDisplayValue("90")).toBeTruthy();
    });
  });

  it("shows custom values from the DB, not defaults", async () => {
    mockFetchProfile.mockResolvedValue({
      sat_fat_g: 15,
      soluble_fiber_g: 12,
      calories: 1800,
      protein_g: 100,
    });
    const { getByDisplayValue } = await render(<SettingsScreen />);
    await waitFor(() => {
      expect(getByDisplayValue("15")).toBeTruthy();
      expect(getByDisplayValue("1800")).toBeTruthy();
    });
  });

  it("saves edited targets via the API", async () => {
    const { getByText, getByLabelText, getByDisplayValue } = await render(
      <SettingsScreen />
    );
    await waitFor(() => getByDisplayValue("18"));
    await fireEvent.changeText(getByLabelText("Saturated fat target"), "16");
    await fireEvent.press(getByText("save targets"));
    await waitFor(() => {
      expect(mockSaveTargets).toHaveBeenCalledWith({
        sat_fat_g: 16,
        soluble_fiber_g: 10,
        calories: 2000,
        protein_g: 90,
      });
      expect(getByText("saved")).toBeTruthy();
    });
  });

  it("blocks saving invalid values", async () => {
    const { getByText, getByLabelText, getByDisplayValue } = await render(
      <SettingsScreen />
    );
    await waitFor(() => getByDisplayValue("18"));
    await fireEvent.changeText(getByLabelText("Saturated fat target"), "0");
    await fireEvent.press(getByText("save targets"));
    expect(mockSaveTargets).not.toHaveBeenCalled();
  });

  it("resets to defaults after confirmation", async () => {
    mockFetchProfile.mockResolvedValue({
      sat_fat_g: 15,
      soluble_fiber_g: 12,
      calories: 1800,
      protein_g: 100,
    });
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        const reset = buttons?.find((b) => b.text === "Reset");
        reset?.onPress?.();
      });
    const { getByText, getByDisplayValue } = await render(<SettingsScreen />);
    await waitFor(() => getByDisplayValue("15"));
    await fireEvent.press(getByText("reset"));
    await waitFor(() => {
      expect(mockSaveTargets).toHaveBeenCalledWith({
        sat_fat_g: 18,
        soluble_fiber_g: 10,
        calories: 2000,
        protein_g: 90,
      });
    });
    alertSpy.mockRestore();
  });

  it("shows the signed-in email", async () => {
    const { getByText } = await render(<SettingsScreen />);
    await waitFor(() => {
      expect(getByText("diogo@example.com")).toBeTruthy();
    });
  });

  it("signs out after confirmation", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        const out = buttons?.find((b) => b.text === "Sign out");
        out?.onPress?.();
      });
    const { getByText } = await render(<SettingsScreen />);
    await waitFor(() => getByText("Sign out"));
    await fireEvent.press(getByText("Sign out"));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
    alertSpy.mockRestore();
  });
});
