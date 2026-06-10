// The cold-start entry route: "/" must resolve the persisted session
// and redirect — Unmatched Route on app open was a shipped bug.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";

const mockGetSession = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => mockGetSession(...a) } },
}));

const mockRedirect = jest.fn((_href: string): null => null);
jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

import Index from "../app/index";

describe("Index entry route", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRedirect.mockReset();
  });

  it("redirects to the tabs when a session exists", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    await render(<Index />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith("/(app)/(tabs)"));
  });

  it("redirects to sign-in when there is no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await render(<Index />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith("/(auth)/sign-in"));
  });

  it("redirects to sign-in when session lookup throws", async () => {
    mockGetSession.mockRejectedValue(new Error("keychain unavailable"));
    await render(<Index />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith("/(auth)/sign-in"));
  });

  it("shows a spinner (not Unmatched Route) while resolving", async () => {
    let resolve!: (v: unknown) => void;
    mockGetSession.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(<Index />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.root).toBeTruthy();
    resolve({ data: { session: null } });
    await waitFor(() => expect(mockRedirect).toHaveBeenCalled());
  });
});
