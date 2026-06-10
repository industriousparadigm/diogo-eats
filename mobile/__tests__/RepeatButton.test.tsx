// Component tests for RepeatButton — the inline ½ / 1× / 2× repeat picker.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { RepeatButton } from "../components/RepeatButton";

describe("RepeatButton", () => {
  it("starts collapsed showing the ↻ again chip", async () => {
    const onRepeat = jest.fn().mockResolvedValue(undefined);
    const { getByText, queryByLabelText } = await render(<RepeatButton onRepeat={onRepeat} />);
    expect(getByText("↻ again")).toBeTruthy();
    expect(queryByLabelText("log again at 1×")).toBeNull();
  });

  it("reveals the scale picker on tap", async () => {
    const onRepeat = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByLabelText } = await render(<RepeatButton onRepeat={onRepeat} />);
    await fireEvent.press(getByText("↻ again"));
    expect(getByLabelText("log again at ½")).toBeTruthy();
    expect(getByLabelText("log again at 1×")).toBeTruthy();
    expect(getByLabelText("log again at 2×")).toBeTruthy();
  });

  it("calls onRepeat with the chosen scale", async () => {
    const onRepeat = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByLabelText } = await render(<RepeatButton onRepeat={onRepeat} />);
    await fireEvent.press(getByText("↻ again"));
    await fireEvent.press(getByLabelText("log again at 2×"));
    await waitFor(() => {
      expect(onRepeat).toHaveBeenCalledWith(2);
    });
  });

  it("collapses back to the chip after a successful repeat", async () => {
    const onRepeat = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByLabelText } = await render(<RepeatButton onRepeat={onRepeat} />);
    await fireEvent.press(getByText("↻ again"));
    await fireEvent.press(getByLabelText("log again at 1×"));
    await waitFor(() => {
      expect(getByText("↻ again")).toBeTruthy();
    });
  });

  it("shows a soft try-again state on failure", async () => {
    const onRepeat = jest.fn().mockRejectedValue(new Error("nope"));
    const { getByText, getByLabelText } = await render(<RepeatButton onRepeat={onRepeat} />);
    await fireEvent.press(getByText("↻ again"));
    await fireEvent.press(getByLabelText("log again at 1×"));
    await waitFor(() => {
      expect(getByText("try again")).toBeTruthy();
    });
  });
});
