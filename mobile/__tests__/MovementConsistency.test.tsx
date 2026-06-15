// MovementConsistency renders the headline + a bar/tick per bucket.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { MovementConsistency } from "../components/MovementConsistency";
import type { Consistency } from "../lib/movementConsistency";

const ms = (d: number) => new Date(2026, 5, d).getTime();

function consistency(over: Partial<Consistency> = {}): Consistency {
  return {
    mode: "day",
    workoutDays: 4,
    topTypes: ["padel", "run"],
    buckets: [
      { label: "1/6", worked: false, intensity: 0, type: null, count: 0, atMs: ms(1) },
      { label: "2/6", worked: true, intensity: 0.4, type: "padel", count: 1, atMs: ms(2) },
      { label: "3/6", worked: false, intensity: 0, type: null, count: 0, atMs: ms(3) },
      { label: "4/6", worked: true, intensity: 1, type: "run", count: 2, atMs: ms(4) },
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

  it("shows a legend of the top activity types", async () => {
    const { getByText } = await render(
      <MovementConsistency consistency={consistency()} periodDays={15} />
    );
    expect(getByText("Padel")).toBeTruthy();
    expect(getByText("Run")).toBeTruthy();
  });

  it("adds an 'Other' legend entry when a bar falls outside the top types", async () => {
    const c = consistency({
      topTypes: ["padel"],
      buckets: [
        { label: "1/6", worked: true, intensity: 0.5, type: "padel", count: 1, atMs: ms(1) },
        { label: "2/6", worked: true, intensity: 0.7, type: "swim", count: 1, atMs: ms(2) },
      ],
    });
    const { getByText } = await render(<MovementConsistency consistency={c} periodDays={15} />);
    expect(getByText("Other")).toBeTruthy();
  });

  it("reveals a bar's details on tap (not shown before)", async () => {
    const { getByLabelText, getByText, queryByText } = await render(
      <MovementConsistency consistency={consistency()} periodDays={15} />
    );
    expect(queryByText(/\+1 more/)).toBeNull(); // detail line hidden until tapped
    await fireEvent.press(getByLabelText(/Run \+1 more/)); // the run bucket (count 2)
    expect(getByText(/Run \+1 more/)).toBeTruthy();
  });
});
