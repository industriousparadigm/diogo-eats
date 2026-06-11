// AlternativesSheet — the four states the "machine taken?" sheet must
// render honestly: loading (a Sonnet call, skeleton not spinner), ranked
// (catalog substitutes + an optional "or add:" section), empty (nothing to
// swap, say so), and error (502 → clean message + retry).

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockFetchAlternatives = jest.fn();
const mockCreateExercise = jest.fn();

jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    status?: number;
    constructor(code: string, message: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  class ExerciseConflictError extends ApiError {
    exercise: unknown;
    constructor(message: string, exercise: unknown) {
      super("EXERCISE_CONFLICT", message, 409);
      this.exercise = exercise;
    }
  }
  return {
    fetchAlternatives: (...a: unknown[]) => mockFetchAlternatives(...a),
    createStrengthExercise: (...a: unknown[]) => mockCreateExercise(...a),
    ApiError,
    ExerciseConflictError,
  };
});

import { AlternativesSheet } from "../components/AlternativesSheet";
import { mockStrengthOverview } from "../lib/strengthFixtures";
import type { Exercise } from "../lib/strengthTypes";

const overview = mockStrengthOverview();
const byId = new Map(overview.exercises.map((e) => [e.id, e]));
const SEATED_ROW = byId.get("seated-row") as Exercise;

async function renderSheet(
  overrides: Partial<React.ComponentProps<typeof AlternativesSheet>> = {}
) {
  const onPickExisting = jest.fn();
  const onCreated = jest.fn();
  const onClose = jest.fn();
  const utils = await render(
    <AlternativesSheet
      visible
      exercise={SEATED_ROW}
      catalogById={byId}
      onClose={onClose}
      onPickExisting={onPickExisting}
      onCreated={onCreated}
      {...overrides}
    />
  );
  return { ...utils, onPickExisting, onCreated, onClose };
}

describe("AlternativesSheet", () => {
  beforeEach(() => {
    mockFetchAlternatives.mockReset();
    mockCreateExercise.mockReset();
  });

  it("titles the sheet with the blocked exercise and shows a skeleton while loading", async () => {
    mockFetchAlternatives.mockReturnValue(new Promise(() => {})); // never resolves
    const { getByText, getByLabelText } = await renderSheet();
    expect(getByText("Seated row taken? Try:")).toBeTruthy();
    expect(getByLabelText("loading alternatives")).toBeTruthy();
  });

  it("renders ranked catalog alternatives with their reason; tapping one picks it", async () => {
    mockFetchAlternatives.mockResolvedValue({
      alternatives: [
        { exercise_id: "chest-press", reason: "same push, different grip" },
        { exercise_id: "leg-press", reason: "keeps the session moving" },
      ],
      suggestions: [],
    });
    const { getByText, getByLabelText, onPickExisting } = await renderSheet();
    await waitFor(() => getByText("same push, different grip"));
    expect(getByText("Chest press")).toBeTruthy();
    expect(getByText("Leg press")).toBeTruthy();
    await fireEvent.press(getByLabelText("use Chest press instead"));
    expect(onPickExisting).toHaveBeenCalledWith("chest-press");
  });

  it("shows an 'or add:' section when suggestions are present; tapping creates + opens", async () => {
    mockFetchAlternatives.mockResolvedValue({
      alternatives: [{ exercise_id: "chest-press", reason: "same push" }],
      suggestions: [
        {
          name: "Cable fly",
          measurement_type: "weight_reps",
          description: "open the chest",
          reason: "isolation when the row's gone",
        },
      ],
    });
    const created = {
      id: "cable-fly",
      name: "Cable fly",
      description: "open the chest",
      measurement_type: "weight_reps",
      image_key: null,
      created_by: "u1",
      sort_order: 9,
    };
    mockCreateExercise.mockResolvedValue(created);
    const { getByText, getByLabelText, onCreated } = await renderSheet();
    await waitFor(() => getByText("OR ADD:"));
    expect(getByText("+ Cable fly")).toBeTruthy();
    await fireEvent.press(getByLabelText("add Cable fly"));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  it("shows honest copy when there are no alternatives and no suggestions", async () => {
    mockFetchAlternatives.mockResolvedValue({ alternatives: [], suggestions: [] });
    const { getByText } = await renderSheet();
    await waitFor(() => getByText(/Nothing close enough to swap in/));
  });

  it("shows a clean error + retry on a 502, and retries the fetch", async () => {
    const { ApiError } = jest.requireMock("../lib/api") as {
      ApiError: new (c: string, m: string, s?: number) => Error;
    };
    mockFetchAlternatives.mockRejectedValueOnce(
      new ApiError("SERVER_ERROR", "couldn't fetch alternatives", 502)
    );
    const { getByText, getByLabelText } = await renderSheet();
    await waitFor(() => getByText("couldn't fetch alternatives"));
    // Retry → second attempt succeeds with a ranked list.
    mockFetchAlternatives.mockResolvedValueOnce({
      alternatives: [{ exercise_id: "chest-press", reason: "same push" }],
      suggestions: [],
    });
    await fireEvent.press(getByLabelText("retry alternatives"));
    await waitFor(() => getByText("Chest press"));
  });
});
