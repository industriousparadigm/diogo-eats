// PeriodSelector — the shared 7d/15d/1mo/3mo/1y control.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { PeriodSelector, PERIODS, DEFAULT_PERIOD_DAYS } from "../components/PeriodSelector";

describe("PeriodSelector", () => {
  it("renders all five periods", async () => {
    const { getByLabelText } = await render(<PeriodSelector value={15} onChange={jest.fn()} />);
    for (const p of PERIODS) {
      expect(getByLabelText(`show ${p.label}`)).toBeTruthy();
    }
  });

  it("fires onChange with the chosen days", async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(<PeriodSelector value={15} onChange={onChange} />);
    fireEvent.press(getByLabelText("show 3mo"));
    expect(onChange).toHaveBeenCalledWith(90);
  });

  it("defaults to 15 days", () => {
    expect(DEFAULT_PERIOD_DAYS).toBe(15);
    expect(PERIODS.some((p) => p.days === 15)).toBe(true);
  });
});
