// Component tests for the live session capture flow — picker ordering,
// prefilled entry, confirm-or-nudge, draft resume, and completion.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

// Walks the serialized host tree: is there a TextInput with the given
// a11y label sitting inside a scroll view that has iOS keyboard insets on?
// That's the structural proof the focused field will scroll above the
// keyboard instead of hiding behind it.
type JsonChild = JsonNode | string;
type JsonNode = {
  type: string;
  props: Record<string, unknown>;
  children?: JsonChild[] | null;
};
function inputIsInsideKeyboardAwareScroll(
  node: JsonNode | null,
  label: string,
  insideAware = false
): boolean {
  if (!node) return false;
  const aware =
    insideAware ||
    (node.type === "RCTScrollView" &&
      node.props.automaticallyAdjustKeyboardInsets === true);
  if (
    aware &&
    node.type === "TextInput" &&
    node.props.accessibilityLabel === label
  ) {
    return true;
  }
  return (node.children ?? [])
    .filter((c): c is JsonNode => typeof c === "object" && c !== null)
    .some((c) => inputIsInsideKeyboardAwareScroll(c, label, aware));
}

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockFetchStrengthOverview = jest.fn();
const mockCompleteStrengthSession = jest.fn();

jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    fetchStrengthOverview: (...args: unknown[]) => mockFetchStrengthOverview(...args),
    completeStrengthSession: (...args: unknown[]) =>
      mockCompleteStrengthSession(...args),
    ApiError,
  };
});

import StrengthSessionScreen from "../app/(app)/strength/session";
import { mockStrengthOverview, mockCompleteSession } from "../lib/strengthFixtures";
import { loadDraft, saveDraft, clearDraft } from "../lib/draftStorage";
import { confirmSeries, createDraft } from "../lib/strengthSession";
import { takeSessionResult } from "../lib/stores";

describe("StrengthSessionScreen", () => {
  beforeEach(async () => {
    mockFetchStrengthOverview.mockReset();
    mockCompleteStrengthSession.mockReset();
    mockBack.mockReset();
    mockReplace.mockReset();
    await clearDraft();
    takeSessionResult(); // drain
    mockFetchStrengthOverview.mockResolvedValue(mockStrengthOverview());
  });

  it("shows a skeleton picker (not a bare spinner) while booting a session", async () => {
    mockFetchStrengthOverview.mockReturnValue(new Promise(() => {}));
    const { findByLabelText, queryByText } = await render(<StrengthSessionScreen />);
    expect(await findByLabelText("loading session")).toBeTruthy();
    // The real machine cards aren't there until the overview resolves.
    expect(queryByText("Leg press")).toBeNull();
  });

  it("shows the five picker cards in most-likely-next order", async () => {
    const { getByText } = await render(<StrengthSessionScreen />);
    await waitFor(() => {
      expect(getByText("Leg press")).toBeTruthy();
      expect(getByText("Back extension")).toBeTruthy();
      expect(getByText("Chest press")).toBeTruthy();
      expect(getByText("Seated row")).toBeTruthy();
      expect(getByText("Farmer's carry")).toBeTruthy();
    });
  });

  it("shows last-time numbers on the picker cards", async () => {
    const { getByText } = await render(<StrengthSessionScreen />);
    await waitFor(() => {
      expect(getByText("last: 32kg × 12  ·  39kg × 12")).toBeTruthy();
    });
  });

  it("opens an exercise with series pre-filled from last session", async () => {
    const { getByText, getAllByDisplayValue } = await render(
      <StrengthSessionScreen />
    );
    await waitFor(() => getByText("Leg press"));
    await fireEvent.press(getByText("Leg press"));
    await waitFor(() => {
      expect(getByText("LEG PRESS")).toBeTruthy();
      expect(getAllByDisplayValue("32").length).toBeGreaterThan(0);
      expect(getAllByDisplayValue("39").length).toBeGreaterThan(0);
    });
  });

  it("confirms a pre-filled set in one tap and shows the done state", async () => {
    const { getByText, getByLabelText } = await render(<StrengthSessionScreen />);
    await waitFor(() => getByText("Leg press"));
    await fireEvent.press(getByText("Leg press"));
    await waitFor(() => getByLabelText("confirm series 1"));
    await fireEvent.press(getByLabelText("confirm series 1"));
    await fireEvent.press(getByText(/Done — 1 set logged/));
    await waitFor(() => {
      expect(getByText("✓ 1 set logged")).toBeTruthy();
      expect(getByText("1 set logged")).toBeTruthy();
    });
  });

  it("persists the draft so a killed app can resume (storage round-trip)", async () => {
    const { getByText, getByLabelText } = await render(<StrengthSessionScreen />);
    await waitFor(() => getByText("Leg press"));
    await fireEvent.press(getByText("Leg press"));
    await waitFor(() => getByLabelText("confirm series 1"));
    await fireEvent.press(getByLabelText("confirm series 1"));
    await waitFor(async () => {
      const stored = await loadDraft();
      expect(stored?.loggedOrder).toEqual(["leg-press"]);
    });
  });

  it("resumes an existing draft instead of starting fresh", async () => {
    const draft = confirmSeries(
      createDraft(mockStrengthOverview(), Date.now()),
      "chest-press",
      0
    );
    await saveDraft(draft);
    const { getByText } = await render(<StrengthSessionScreen />);
    await waitFor(() => {
      expect(getByText("1 set logged")).toBeTruthy();
    });
    // No network needed for resume.
    expect(mockFetchStrengthOverview).not.toHaveBeenCalled();
  });

  it("nudging a stepper changes the value", async () => {
    const { getByText, getByLabelText, getAllByDisplayValue } = await render(
      <StrengthSessionScreen />
    );
    await waitFor(() => getByText("Leg press"));
    await fireEvent.press(getByText("Leg press"));
    await waitFor(() => getByLabelText("series 2 weight plus 1"));
    await fireEvent.press(getByLabelText("series 2 weight plus 1"));
    await waitFor(() => {
      expect(getAllByDisplayValue("40").length).toBeGreaterThan(0);
    });
  });

  it("completes the session: POSTs confirmed sets, clears the draft, shows highlights", async () => {
    mockCompleteStrengthSession.mockImplementation(async (payload) =>
      mockCompleteSession(payload)
    );
    const { getByText, getByLabelText } = await render(<StrengthSessionScreen />);
    await waitFor(() => getByText("Leg press"));
    await fireEvent.press(getByText("Leg press"));
    await waitFor(() => getByLabelText("confirm series 1"));
    await fireEvent.press(getByLabelText("confirm series 1"));
    await fireEvent.press(getByText(/Done — 1 set logged/));
    await fireEvent.press(getByText("Session complete"));
    await waitFor(() => {
      expect(mockCompleteStrengthSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sets: [
            { exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 12 },
          ],
        })
      );
      expect(mockReplace).toHaveBeenCalledWith("/(app)/strength/highlights");
    });
    expect(await loadDraft()).toBeNull();
    expect(takeSessionResult()).not.toBeNull();
  });

  it("keeps the draft when completion fails (flaky gym network)", async () => {
    const { ApiError } = jest.requireMock("../lib/api") as {
      ApiError: new (code: string, message: string) => Error;
    };
    mockCompleteStrengthSession.mockRejectedValue(
      new ApiError("NETWORK_ERROR", "No network")
    );
    const { getByText, getByLabelText } = await render(<StrengthSessionScreen />);
    await waitFor(() => getByText("Leg press"));
    await fireEvent.press(getByText("Leg press"));
    await waitFor(() => getByLabelText("confirm series 1"));
    await fireEvent.press(getByLabelText("confirm series 1"));
    await fireEvent.press(getByText(/Done — 1 set logged/));
    await fireEvent.press(getByText("Session complete"));
    await waitFor(() => {
      expect(getByText(/saved on this phone/)).toBeTruthy();
    });
    expect(await loadDraft()).not.toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("disables Session complete until at least one set is confirmed", async () => {
    const { getByText, getByLabelText } = await render(<StrengthSessionScreen />);
    await waitFor(() => getByText("Session complete"));
    await fireEvent.press(getByText("Session complete"));
    expect(mockCompleteStrengthSession).not.toHaveBeenCalled();
    // After confirming one set it becomes available.
    await fireEvent.press(getByText("Leg press"));
    await waitFor(() => getByLabelText("confirm series 1"));
    await fireEvent.press(getByLabelText("confirm series 1"));
    await fireEvent.press(getByText(/Done — 1 set logged/));
    mockCompleteStrengthSession.mockImplementation(async (payload) =>
      mockCompleteSession(payload)
    );
    await fireEvent.press(getByText("Session complete"));
    await waitFor(() => {
      expect(mockCompleteStrengthSession).toHaveBeenCalled();
    });
  });

  it("stores a session note in the draft", async () => {
    const { getByText, getByLabelText } = await render(<StrengthSessionScreen />);
    await waitFor(() => getByText("+ add a note (optional)"));
    await fireEvent.press(getByText("+ add a note (optional)"));
    await fireEvent.changeText(getByLabelText("session note"), "10min warmup run");
    await waitFor(async () => {
      const stored = await loadDraft();
      expect(stored?.note).toBe("10min warmup run");
    });
  });

  // Regression guard for the owner's bug: the picker view (where the note
  // lives) shipped with NO keyboard avoider, so the focused note opened
  // behind the keyboard. The note field must be a descendant of the shared
  // KeyboardAwareScrollView, never a bare ScrollView.
  it("renders the session note inside the keyboard-aware scroll (not behind the keyboard)", async () => {
    const { getByText, getByLabelText, toJSON } = await render(
      <StrengthSessionScreen />
    );
    await waitFor(() => getByText("+ add a note (optional)"));
    await fireEvent.press(getByText("+ add a note (optional)"));
    getByLabelText("session note"); // present
    expect(
      inputIsInsideKeyboardAwareScroll(toJSON() as unknown as JsonNode, "session note")
    ).toBe(true);
  });
});
