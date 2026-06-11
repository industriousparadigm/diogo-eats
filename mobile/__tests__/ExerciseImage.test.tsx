// ExerciseImage — the placeholder audit. image_key is now string | null;
// a user-created exercise (or an unbundled key) MUST render a placeholder,
// never crash and never leave a ragged hole where the inked frame sits.

import React from "react";
import { render } from "@testing-library/react-native";
import { ExerciseImage } from "../components/ExerciseImage";

describe("ExerciseImage", () => {
  it("renders the placeholder (labeled) for a null image_key without crashing", async () => {
    const { getByLabelText } = await render(
      <ExerciseImage imageKey={null} style={{ width: 56, height: 42 }} />
    );
    expect(getByLabelText("no exercise image")).toBeTruthy();
  });

  it("renders the placeholder for an unknown/unbundled key", async () => {
    const { getByLabelText } = await render(
      <ExerciseImage imageKey={"not-a-bundled-key"} style={{ width: 56, height: 42 }} />
    );
    expect(getByLabelText("no exercise image")).toBeTruthy();
  });

  it("renders the placeholder for undefined too (defensive)", async () => {
    const { getByLabelText } = await render(
      <ExerciseImage imageKey={undefined} style={{ width: 56, height: 42 }} />
    );
    expect(getByLabelText("no exercise image")).toBeTruthy();
  });

  it("renders the real image (no placeholder) for a bundled key", async () => {
    const { queryByLabelText, toJSON } = await render(
      <ExerciseImage imageKey={"tricep-pulley"} style={{ width: 56, height: 42 }} />
    );
    // The placeholder is NOT present — the bundled asset rendered instead.
    expect(queryByLabelText("no exercise image")).toBeNull();
    expect(toJSON()).toBeTruthy();
  });

  it("renders the bundled key for every seeded exercise without crashing", async () => {
    for (const key of [
      "leg-press",
      "back-extension",
      "chest-press",
      "seated-row",
      "farmers-carry",
      "tricep-pulley",
    ]) {
      const { queryByLabelText } = await render(
        <ExerciseImage imageKey={key} style={{ width: 56, height: 42 }} />
      );
      expect(queryByLabelText("no exercise image")).toBeNull();
    }
  });
});
