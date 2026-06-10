// Chip-visibility rules for the meal-edit item row (DESIGN.md
// "Uncertainty"): a LOW-confidence item wears a calm "guess" chip;
// medium/high wear nothing. No bare colored confidence dot any more.

import React from "react";
import { render } from "@testing-library/react-native";
import { EditItemRow } from "../components/EditItemRow";
import type { Item } from "../lib/types";

function item(confidence: Item["confidence"]): Item {
  return {
    name: "olive oil",
    grams: 10,
    confidence,
    is_plant: true,
    per_100g: { sat_fat_g: 14, soluble_fiber_g: 0, calories: 884, protein_g: 0 },
  };
}

const noop = () => {};

function renderRow(confidence: Item["confidence"]) {
  return render(
    <EditItemRow
      item={item(confidence)}
      onName={noop}
      onGrams={noop}
      onRemove={noop}
      disabled={false}
    />
  );
}

describe("EditItemRow uncertainty chip", () => {
  it("shows a 'guess' chip for a low-confidence item", async () => {
    const { getByText, getByLabelText } = await renderRow("low");
    expect(getByText("guess")).toBeTruthy();
    expect(getByLabelText("low-confidence guess")).toBeTruthy();
  });

  it("shows no chip for a medium-confidence item", async () => {
    const { queryByText } = await renderRow("medium");
    expect(queryByText("guess")).toBeNull();
  });

  it("shows no chip for a high-confidence item", async () => {
    const { queryByText } = await renderRow("high");
    expect(queryByText("guess")).toBeNull();
  });

  it("still renders the per-item nutrient summary", async () => {
    const { getByText } = await renderRow("high");
    // 10g of 884kcal/100g = 88 kcal, 14g/100g sat = 1.4g.
    expect(getByText("88 kcal · 1.4g sat")).toBeTruthy();
  });
});
