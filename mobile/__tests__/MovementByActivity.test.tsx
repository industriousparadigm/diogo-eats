// MovementByActivity — the frequency leaderboard panel: one row per type
// (count = hero, a relative bar in the type colour, a secondary metric),
// sorted by count, tappable to that type's screen.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { MovementByActivity } from "../components/MovementByActivity";
import type { MovementRollup } from "../lib/movementRollup";

function rollup(over: Partial<MovementRollup>): MovementRollup {
  return {
    type: "padel",
    kind: "activity",
    count: 1,
    avgStrain: null,
    avgDurationMin: 90,
    totalBeats: null,
    lastAt: 0,
    items: [],
    ...over,
  };
}

const ROLLUPS: MovementRollup[] = [
  rollup({ type: "padel", count: 6, avgStrain: 12.4 }),
  rollup({ type: "gym", kind: "gym", count: 3, avgStrain: null, totalBeats: 9 }),
  rollup({ type: "run", count: 1, avgStrain: null, avgDurationMin: 40 }),
];

describe("MovementByActivity", () => {
  it("renders a row per type with the count + a fitting metric", async () => {
    const { getByText } = await render(
      <MovementByActivity rollups={ROLLUPS} onPressType={jest.fn()} />
    );
    expect(getByText("Padel")).toBeTruthy();
    expect(getByText("6×")).toBeTruthy();
    expect(getByText("avg strain 12.4")).toBeTruthy(); // padel: strain
    expect(getByText("9 beats")).toBeTruthy(); // gym: beats
    expect(getByText("~40 min")).toBeTruthy(); // run: avg duration fallback
  });

  it("navigates to a type's screen on tap", async () => {
    const onPressType = jest.fn();
    const { getByLabelText } = await render(
      <MovementByActivity rollups={ROLLUPS} onPressType={onPressType} />
    );
    await fireEvent.press(getByLabelText("view Gym"));
    expect(onPressType).toHaveBeenCalledWith("gym");
  });

  it("renders nothing when there are no rollups", async () => {
    const { toJSON } = await render(<MovementByActivity rollups={[]} onPressType={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });
});
