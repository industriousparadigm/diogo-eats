// Unit tests for lib/colors.ts — plantColor function.

import { plantColor, colors } from "../lib/colors";

describe("plantColor", () => {
  it("returns plant.none when hasMeals is false", () => {
    expect(plantColor(100, false)).toBe(colors.plant.none);
    expect(plantColor(0, false)).toBe(colors.plant.none);
  });

  it("returns plant.full for >= 90%", () => {
    expect(plantColor(90, true)).toBe(colors.plant.full);
    expect(plantColor(100, true)).toBe(colors.plant.full);
    expect(plantColor(95.5, true)).toBe(colors.plant.full);
  });

  it("returns plant.high for 70-89%", () => {
    expect(plantColor(70, true)).toBe(colors.plant.high);
    expect(plantColor(89, true)).toBe(colors.plant.high);
  });

  it("returns plant.mid for 50-69%", () => {
    expect(plantColor(50, true)).toBe(colors.plant.mid);
    expect(plantColor(69, true)).toBe(colors.plant.mid);
  });

  it("returns plant.low for 30-49%", () => {
    expect(plantColor(30, true)).toBe(colors.plant.low);
    expect(plantColor(49, true)).toBe(colors.plant.low);
  });

  it("returns plant.veryLow for < 30%", () => {
    expect(plantColor(0, true)).toBe(colors.plant.veryLow);
    expect(plantColor(29, true)).toBe(colors.plant.veryLow);
  });
});
