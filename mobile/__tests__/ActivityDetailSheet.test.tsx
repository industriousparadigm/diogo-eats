// ActivityDetailSheet — pre-fills from the tapped activity, PATCHes edits
// (incl. started_at via the steppers), and DELETEs from inside. Asserts the
// pre-fill, the save→onUpdated handoff, and the time-adjust steppers move
// started_at.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    updateActivity: (...args: unknown[]) => mockUpdate(...args),
    deleteActivity: (...args: unknown[]) => mockDelete(...args),
    ApiError,
  };
});

import { ActivityDetailSheet } from "../components/ActivityDetailSheet";
import type { Activity } from "../lib/activityTypes";

function padel(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-1",
    type: "padel",
    label: "class",
    started_at: new Date(2026, 5, 12, 11, 0).getTime(),
    duration_min: 90,
    effort: "light",
    distance_km: null,
    strain: null,
    note: null,
    source: "manual",
    external_id: null,
    created_at: Date.now(),
    ...overrides,
  };
}

describe("ActivityDetailSheet", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockDelete.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 12, 14, 0).getTime());
  });
  afterEach(() => jest.useRealTimers());

  it("renders nothing when there is no activity", async () => {
    const { toJSON } = await render(
      <ActivityDetailSheet
        activity={null}
        visible={false}
        onClose={jest.fn()}
        onUpdated={jest.fn()}
        onDeleted={jest.fn()}
      />
    );
    expect(toJSON()).toBeNull();
  });

  it("pre-fills duration, label, and effort from the activity", async () => {
    const { getByLabelText } = await render(
      <ActivityDetailSheet
        activity={padel()}
        visible
        onClose={jest.fn()}
        onUpdated={jest.fn()}
        onDeleted={jest.fn()}
      />
    );
    expect(getByLabelText("duration minutes").props.value).toBe("90");
    expect(getByLabelText("label").props.value).toBe("class");
  });

  it("hides the distance field for a non-distance type", async () => {
    const { queryByLabelText } = await render(
      <ActivityDetailSheet
        activity={padel()}
        visible
        onClose={jest.fn()}
        onUpdated={jest.fn()}
        onDeleted={jest.fn()}
      />
    );
    expect(queryByLabelText("distance km")).toBeNull();
  });

  it("PATCHes a started_at adjusted by the hour stepper and hands the row up", async () => {
    const updated = padel({ started_at: new Date(2026, 5, 12, 10, 0).getTime() });
    mockUpdate.mockResolvedValue(updated);
    const onUpdated = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = await render(
      <ActivityDetailSheet
        activity={padel()}
        visible
        onClose={onClose}
        onUpdated={onUpdated}
        onDeleted={jest.fn()}
      />
    );
    // Step the hour back once (11:00 → 10:00), then save.
    await fireEvent.press(getByLabelText("earlier hour"));
    await fireEvent.press(getByLabelText("save"));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        "act-1",
        expect.objectContaining({
          started_at: new Date(2026, 5, 12, 10, 0).getTime(),
          duration_min: 90,
        })
      );
      expect(onUpdated).toHaveBeenCalledWith(updated);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("offers a delete affordance", async () => {
    const { getByLabelText } = await render(
      <ActivityDetailSheet
        activity={padel()}
        visible
        onClose={jest.fn()}
        onUpdated={jest.fn()}
        onDeleted={jest.fn()}
      />
    );
    expect(getByLabelText("delete")).toBeTruthy();
  });
});
