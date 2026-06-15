// WhoopPullButton — taps the sync+import, reports the result inline, and
// refetches the landing only when something actually changed.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockPull = jest.fn();
jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { pullFromWhoop: (...a: unknown[]) => mockPull(...a), ApiError };
});

import { WhoopPullButton } from "../components/WhoopPullButton";

describe("WhoopPullButton", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reports added/updated and refetches when something changed", async () => {
    mockPull.mockResolvedValue({ syncStatus: "ok", workouts_upserted: 3, added: 2, enriched: 1 });
    const onPulled = jest.fn();
    const { getByLabelText, findByText } = await render(<WhoopPullButton onPulled={onPulled} />);
    await fireEvent.press(getByLabelText("pull from whoop"));
    expect(await findByText(/\+2 new/)).toBeTruthy();
    await waitFor(() => expect(onPulled).toHaveBeenCalled());
  });

  it("says 'up to date' and does NOT refetch when nothing changed", async () => {
    mockPull.mockResolvedValue({ syncStatus: "ok", workouts_upserted: 0, added: 0, enriched: 0 });
    const onPulled = jest.fn();
    const { getByLabelText, findByText } = await render(<WhoopPullButton onPulled={onPulled} />);
    await fireEvent.press(getByLabelText("pull from whoop"));
    expect(await findByText(/up to date/i)).toBeTruthy();
    expect(onPulled).not.toHaveBeenCalled();
  });

  it("prompts a reconnect on any non-ok sync (expired or error)", async () => {
    for (const syncStatus of ["expired", "error"]) {
      mockPull.mockResolvedValueOnce({ syncStatus, workouts_upserted: 0, added: 0, enriched: 0 });
      const { getByLabelText, findByText } = await render(<WhoopPullButton onPulled={jest.fn()} />);
      await fireEvent.press(getByLabelText("pull from whoop"));
      expect(await findByText(/reconnect/i)).toBeTruthy();
    }
  });
});
