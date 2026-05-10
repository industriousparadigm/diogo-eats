import { describe, it, expect } from "vitest";
import { plantColor, colors } from "../styles";

describe("plantColor", () => {
  it("returns the empty color when there are no meals", () => {
    expect(plantColor(0, false)).toBe(colors.plant.none);
    expect(plantColor(50, false)).toBe(colors.plant.none);
    expect(plantColor(100, false)).toBe(colors.plant.none);
  });

  it("scales through the green ramp as plant_pct rises", () => {
    expect(plantColor(0, true)).toBe(colors.plant.veryLow);
    expect(plantColor(20, true)).toBe(colors.plant.veryLow);
    expect(plantColor(30, true)).toBe(colors.plant.low);
    expect(plantColor(50, true)).toBe(colors.plant.mid);
    expect(plantColor(70, true)).toBe(colors.plant.high);
    expect(plantColor(90, true)).toBe(colors.plant.full);
    expect(plantColor(100, true)).toBe(colors.plant.full);
  });

  it("color thresholds are inclusive at the boundary (>= not >)", () => {
    // 30 → low (>=30), 29 → veryLow
    expect(plantColor(30, true)).toBe(colors.plant.low);
    expect(plantColor(29, true)).toBe(colors.plant.veryLow);
  });
});
