// Component tests for the Sign-in screen.
// Tests the two-step flow: email → OTP code → verified.
//
// @testing-library/react-native v14 notes:
// - render() is async — must be awaited.
// - fireEvent.press / fireEvent.changeText are async — must be awaited.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

// Mock expo-router
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSegments: () => [],
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

// mock* variables are accessible inside jest.mock factories per jest hoisting rules.
const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  },
}));

import SignInScreen from "../app/(auth)/sign-in";

describe("SignInScreen", () => {
  beforeEach(() => {
    mockSignInWithOtp.mockReset();
    mockVerifyOtp.mockReset();
  });

  it("renders the email step initially", async () => {
    const { getByPlaceholderText, getByText } = await render(<SignInScreen />);
    expect(getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(getByText("Send code")).toBeTruthy();
    expect(getByText("eats")).toBeTruthy();
  });

  it("shows an error for invalid email format without calling signInWithOtp", async () => {
    const { getByPlaceholderText, getByText } = await render(<SignInScreen />);
    await fireEvent.changeText(getByPlaceholderText("you@example.com"), "not-an-email");
    await fireEvent.press(getByText("Send code"));
    await waitFor(() => {
      expect(getByText("Enter a valid email address")).toBeTruthy();
    });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("advances to code step after signInWithOtp succeeds", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    const { getByPlaceholderText, getByText } = await render(<SignInScreen />);
    await fireEvent.changeText(getByPlaceholderText("you@example.com"), "test@example.com");
    await fireEvent.press(getByText("Send code"));
    await waitFor(() => {
      expect(getByText("6-digit code")).toBeTruthy();
    });
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "test@example.com",
      options: { shouldCreateUser: false },
    });
  });

  it("shows error when email is not registered", async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: { message: "Signups not allowed for otp" },
    });
    const { getByPlaceholderText, getByText } = await render(<SignInScreen />);
    await fireEvent.changeText(getByPlaceholderText("you@example.com"), "nope@example.com");
    await fireEvent.press(getByText("Send code"));
    await waitFor(() => {
      expect(getByText(/registered/i)).toBeTruthy();
    });
  });

  it("shows error for wrong OTP code", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({
      error: { message: "Token has expired or is invalid" },
    });

    const { getByPlaceholderText, getByText } = await render(<SignInScreen />);
    await fireEvent.changeText(getByPlaceholderText("you@example.com"), "test@example.com");
    await fireEvent.press(getByText("Send code"));
    await waitFor(() => getByText("6-digit code"));

    await fireEvent.changeText(getByPlaceholderText("000000"), "123456");
    await fireEvent.press(getByText("Sign in"));
    await waitFor(() => {
      expect(getByText("Wrong or expired code — try again")).toBeTruthy();
    });
  });

  it("calls verifyOtp with email, token, and type=email", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ error: null, data: { session: {} } });

    const { getByPlaceholderText, getByText } = await render(<SignInScreen />);
    await fireEvent.changeText(getByPlaceholderText("you@example.com"), "test@example.com");
    await fireEvent.press(getByText("Send code"));
    await waitFor(() => getByText("6-digit code"));

    await fireEvent.changeText(getByPlaceholderText("000000"), "654321");
    await fireEvent.press(getByText("Sign in"));
    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: "test@example.com",
        token: "654321",
        type: "email",
      });
    });
  });

  it("shows error for too-short code without calling verifyOtp", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    const { getByPlaceholderText, getByText } = await render(<SignInScreen />);
    await fireEvent.changeText(getByPlaceholderText("you@example.com"), "test@example.com");
    await fireEvent.press(getByText("Send code"));
    await waitFor(() => getByText("6-digit code"));

    await fireEvent.changeText(getByPlaceholderText("000000"), "123");
    await fireEvent.press(getByText("Sign in"));
    await waitFor(() => {
      expect(getByText("Enter the 6-digit code from your email")).toBeTruthy();
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns to email step when 'Use a different email' is pressed", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    const { getByPlaceholderText, getByText } = await render(<SignInScreen />);
    await fireEvent.changeText(getByPlaceholderText("you@example.com"), "test@example.com");
    await fireEvent.press(getByText("Send code"));
    await waitFor(() => getByText("Use a different email"));
    await fireEvent.press(getByText("Use a different email"));
    await waitFor(() => {
      expect(getByPlaceholderText("you@example.com")).toBeTruthy();
    });
  });
});
