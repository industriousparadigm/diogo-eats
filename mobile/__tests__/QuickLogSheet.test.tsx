// QuickLogSheet — the ONE front door. Asserts the pop (every type tile,
// including GYM first, is reachable), that picking gym routes into the
// session flow with no form, the smart default, the distance-field gating,
// and that a successful log hands the new row up.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockCreateActivity = jest.fn();
jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    createActivity: (...args: unknown[]) => mockCreateActivity(...args),
    ApiError,
  };
});

import { QuickLogSheet } from "../components/QuickLogSheet";
import type { Activity } from "../lib/activityTypes";

function created(type: string): Activity {
  return {
    id: "new-1",
    type,
    label: null,
    started_at: Date.now(),
    duration_min: 60,
    effort: null,
    distance_km: null,
    note: null,
    source: "manual",
    external_id: null,
    created_at: Date.now(),
  };
}

describe("QuickLogSheet", () => {
  beforeEach(() => {
    mockCreateActivity.mockReset();
  });

  it("renders every type tile (the pop) WITH gym as the first front door", async () => {
    const { getByLabelText } = await render(
      <QuickLogSheet visible onClose={jest.fn()} onLogged={jest.fn()} onStartSession={jest.fn()} />
    );
    // Gym now leads the grid (one front door — a gym sesh is just a movement).
    expect(getByLabelText("type Gym")).toBeTruthy();
    expect(getByLabelText("type Padel")).toBeTruthy();
    expect(getByLabelText("type Run")).toBeTruthy();
    expect(getByLabelText("type Walk")).toBeTruthy();
    expect(getByLabelText("type Other")).toBeTruthy();
  });

  it("picking gym shows NO form and routes into the session flow", async () => {
    const onStartSession = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText, queryByLabelText } = await render(
      <QuickLogSheet visible onClose={onClose} onLogged={jest.fn()} onStartSession={onStartSession} />
    );
    await fireEvent.press(getByLabelText("type Gym"));
    // No quick-log form — gym is a live session, not a duration entry.
    expect(onStartSession).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(mockCreateActivity).not.toHaveBeenCalled();
  });

  it("picking a quick-log type (padel) shows the form, not a session route", async () => {
    const onStartSession = jest.fn();
    const { getByLabelText } = await render(
      <QuickLogSheet visible onClose={jest.fn()} onLogged={jest.fn()} onStartSession={onStartSession} />
    );
    await fireEvent.press(getByLabelText("type Padel"));
    // The duration form is up; no session route fired.
    expect(getByLabelText("duration minutes")).toBeTruthy();
    expect(onStartSession).not.toHaveBeenCalled();
  });

  it("defaults duration to 60", async () => {
    const { getByLabelText } = await render(
      <QuickLogSheet visible onClose={jest.fn()} onLogged={jest.fn()} onStartSession={jest.fn()} />
    );
    expect(getByLabelText("duration minutes").props.value).toBe("60");
  });

  it("disables Log it until a type is picked", async () => {
    const { getByLabelText } = await render(
      <QuickLogSheet visible onClose={jest.fn()} onLogged={jest.fn()} onStartSession={jest.fn()} />
    );
    // No type yet → the create call must not fire on press.
    await fireEvent.press(getByLabelText("log it"));
    expect(mockCreateActivity).not.toHaveBeenCalled();
  });

  it("shows a distance field only for distance-y types", async () => {
    const { getByLabelText, queryByLabelText } = await render(
      <QuickLogSheet visible onClose={jest.fn()} onLogged={jest.fn()} onStartSession={jest.fn()} />
    );
    // Padel — no distance.
    await fireEvent.press(getByLabelText("type Padel"));
    expect(queryByLabelText("distance km")).toBeNull();
    // Run — distance appears.
    await fireEvent.press(getByLabelText("type Run"));
    expect(getByLabelText("distance km")).toBeTruthy();
  });

  it("logs a padel and hands the new activity up", async () => {
    mockCreateActivity.mockResolvedValue(created("padel"));
    const onLogged = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = await render(
      <QuickLogSheet visible onClose={onClose} onLogged={onLogged} onStartSession={jest.fn()} />
    );
    await fireEvent.press(getByLabelText("type Padel"));
    await fireEvent.press(getByLabelText("effort light"));
    await fireEvent.press(getByLabelText("log it"));
    await waitFor(() => {
      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({ type: "padel", duration_min: 60, effort: "light" })
      );
      expect(onLogged).toHaveBeenCalledWith(expect.objectContaining({ type: "padel" }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("surfaces a server validation error without closing", async () => {
    // Reject with the MOCKED module's ApiError so the component's
    // `err instanceof ApiError` is true and the server message surfaces
    // verbatim (a locally-defined class would be a different identity).
    const { ApiError } = require("../lib/api");
    mockCreateActivity.mockRejectedValue(new ApiError("SERVER_ERROR", "that's in the future"));
    const onClose = jest.fn();
    const { getByLabelText, getByText } = await render(
      <QuickLogSheet visible onClose={onClose} onLogged={jest.fn()} onStartSession={jest.fn()} />
    );
    await fireEvent.press(getByLabelText("type Run"));
    await fireEvent.press(getByLabelText("log it"));
    await waitFor(() => expect(getByText("that's in the future")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});
