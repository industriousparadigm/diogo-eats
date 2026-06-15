// MovementConsistency renders the headline + a bar/tick per bucket.

import React from "react";
import { render } from "@testing-library/react-native";
import { MovementConsistency } from "../components/MovementConsistency";
import type { Consistency } from "../lib/movementConsistency";

function consistency(over: Partial<Consistency> = {}): Consistency {
  return {
    mode: "day",
    workoutDays: 4,
    buckets: [
      { label: "1/6", worked: false, intensity: 0 },
      { label: "2/6", worked: true, intensity: 0.4 },
      { label: "3/6", worked: false, intensity: 0 },
      { label: "4/6", worked: true, intensity: 1 },
    ],
    ...over,
  };
}

describe("MovementConsistency", () => {
  it("shows the WORKED OUT headline with the count and window", async () => {
    const { getByText } = await render(
      <MovementConsistency consistency={consistency({ workoutDays: 4 })} periodDays={15} />
    );
    expect(getByText("WORKED OUT")).toBeTruthy();
    expect(getByText("4")).toBeTruthy();
    expect(getByText(/of last 15 days/)).toBeTruthy();
  });

  it("labels the axis ends (oldest -> today)", async () => {
    const { getByText } = await render(
      <MovementConsistency consistency={consistency()} periodDays={15} />
    );
    expect(getByText("15d ago")).toBeTruthy();
    expect(getByText("today")).toBeTruthy();
  });

  it("carries an accessible summary", async () => {
    const { getByLabelText } = await render(
      <MovementConsistency consistency={consistency({ workoutDays: 4 })} periodDays={30} />
    );
    expect(getByLabelText("worked out 4 of the last 30 days")).toBeTruthy();
  });
});
