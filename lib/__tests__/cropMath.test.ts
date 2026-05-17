import { describe, it, expect } from "vitest";
import {
  effectiveDims,
  containedDisplayDims,
  clampRectToBox,
  displayRectToSourcePixels,
  rotateCW,
  rotateCCW,
} from "../cropMath";

describe("effectiveDims", () => {
  it("0 and 180 preserve dims", () => {
    expect(effectiveDims(800, 600, 0)).toEqual({ w: 800, h: 600 });
    expect(effectiveDims(800, 600, 180)).toEqual({ w: 800, h: 600 });
  });
  it("90 and 270 swap dims", () => {
    expect(effectiveDims(800, 600, 90)).toEqual({ w: 600, h: 800 });
    expect(effectiveDims(800, 600, 270)).toEqual({ w: 600, h: 800 });
  });
});

describe("containedDisplayDims", () => {
  it("fits a landscape into a square container with letterboxing", () => {
    // 800x600 into 400x400 → scale = min(400/800, 400/600) = 0.5 → 400x300
    expect(containedDisplayDims(800, 600, 400, 400)).toEqual({ w: 400, h: 300 });
  });
  it("fits a portrait into a landscape container", () => {
    expect(containedDisplayDims(600, 800, 400, 400)).toEqual({ w: 300, h: 400 });
  });
  it("returns zero when source is zero", () => {
    expect(containedDisplayDims(0, 600, 400, 400)).toEqual({ w: 0, h: 0 });
  });
});

describe("clampRectToBox", () => {
  it("snaps inside bounds when the rect is entirely outside", () => {
    const r = clampRectToBox(
      { x: 500, y: 500, width: 100, height: 100 },
      { w: 400, h: 400 }
    );
    expect(r.x).toBe(300);
    expect(r.y).toBe(300);
    expect(r.width).toBe(100);
    expect(r.height).toBe(100);
  });
  it("preserves a fully-contained rect", () => {
    const r = clampRectToBox(
      { x: 50, y: 50, width: 100, height: 100 },
      { w: 400, h: 400 }
    );
    expect(r).toEqual({ x: 50, y: 50, width: 100, height: 100 });
  });
  it("enforces minimum width/height", () => {
    const r = clampRectToBox(
      { x: 0, y: 0, width: 5, height: 5 },
      { w: 400, h: 400 },
      24
    );
    expect(r.width).toBeGreaterThanOrEqual(24);
    expect(r.height).toBeGreaterThanOrEqual(24);
  });
  it("caps to bounds size when rect is larger", () => {
    const r = clampRectToBox(
      { x: 0, y: 0, width: 9999, height: 9999 },
      { w: 400, h: 300 }
    );
    expect(r.width).toBe(400);
    expect(r.height).toBe(300);
  });
});

describe("displayRectToSourcePixels", () => {
  it("maps a 0° rect linearly through the display scale", () => {
    // 800x600 source, displayed as 400x300, picks (100,100)-(200,200) display
    // → source pixel (200,200)-(400,400)
    const r = displayRectToSourcePixels(
      { x: 100, y: 100, width: 100, height: 100 },
      { w: 400, h: 300 },
      800,
      600,
      0
    );
    expect(r).toEqual({ x: 200, y: 200, width: 200, height: 200 });
  });

  it("90° rotation maps the display rect's top-left to source bottom-left", () => {
    // 800x600 source, rotated 90° CW → effective 600x800, displayed full.
    // Top-left of display (0,0)-(100,100) at display=600x800 → effective
    // (0,0)-(100,100) source-rotated → source pixels (0, 800-100-100, 100, 100)
    // After rotation, source = (0, 800-200, 100, 100) = (0, 600, 100, 100)
    // but wait that's outside source bounds (height 600)... let me recompute.
    // Actually source is 800x600, rotated → effective is sourceH×sourceW = 600×800.
    // OK so 600 wide x 800 tall effective. Display = 600x800 (full).
    // Rect (0,0)-(100,100) display = (0,0)-(100,100) effective.
    // Mapping back to source: source.x = effective.y = 0,
    //                        source.y = sourceH - effective.x - effective.w
    //                                 = 600 - 0 - 100 = 500
    // Width = effective.h = 100, Height = effective.w = 100.
    const r = displayRectToSourcePixels(
      { x: 0, y: 0, width: 100, height: 100 },
      { w: 600, h: 800 },
      800,
      600,
      90
    );
    expect(r).toEqual({ x: 0, y: 500, width: 100, height: 100 });
  });

  it("180° rotation flips x and y", () => {
    const r = displayRectToSourcePixels(
      { x: 0, y: 0, width: 100, height: 100 },
      { w: 400, h: 300 },
      800,
      600,
      180
    );
    expect(r.x).toBe(800 - 200); // 600
    expect(r.y).toBe(600 - 200); // 400
    expect(r.width).toBe(200);
    expect(r.height).toBe(200);
  });
});

describe("rotateCW / rotateCCW", () => {
  it("cycles CW correctly", () => {
    expect(rotateCW(0)).toBe(90);
    expect(rotateCW(90)).toBe(180);
    expect(rotateCW(180)).toBe(270);
    expect(rotateCW(270)).toBe(0);
  });
  it("cycles CCW correctly", () => {
    expect(rotateCCW(0)).toBe(270);
    expect(rotateCCW(270)).toBe(180);
  });
});
