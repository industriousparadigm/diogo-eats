// Unit tests for lib/cropMath.ts — the pure crop geometry that drives the
// native PhotoCropSheet (contain scaling, corner-resize, clamp, and the
// display→source-pixel mapping handed to expo-image-manipulator).

import {
  containedDisplayDims,
  clampRectToBox,
  resizeRectFromCorner,
  moveRectWithin,
  displayRectToSourceCrop,
  type Rect,
} from "../lib/cropMath";

describe("containedDisplayDims", () => {
  it("fits a landscape image by width", () => {
    // 2000×1000 inside a 400×400 box → scale 0.2 → 400×200.
    const d = containedDisplayDims(2000, 1000, 400, 400);
    expect(d).toEqual({ w: 400, h: 200, scale: 0.2 });
  });

  it("fits a portrait image by height", () => {
    // 1000×2000 inside 400×400 → scale 0.2 → 200×400.
    const d = containedDisplayDims(1000, 2000, 400, 400);
    expect(d).toEqual({ w: 200, h: 400, scale: 0.2 });
  });

  it("guards degenerate source dims", () => {
    expect(containedDisplayDims(0, 0, 400, 400)).toEqual({ w: 0, h: 0, scale: 1 });
  });
});

describe("clampRectToBox", () => {
  const bounds = { w: 300, h: 200 };

  it("pulls an over-large rect inside the box", () => {
    const r = clampRectToBox({ x: -10, y: -10, width: 400, height: 400 }, bounds);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(bounds.w);
    expect(r.y + r.height).toBeLessThanOrEqual(bounds.h);
  });

  it("enforces a minimum size", () => {
    const r = clampRectToBox({ x: 0, y: 0, width: 5, height: 5 }, bounds, 32);
    expect(r.width).toBe(32);
    expect(r.height).toBe(32);
  });
});

describe("resizeRectFromCorner", () => {
  const start: Rect = { x: 50, y: 50, width: 100, height: 100 };
  const bounds = { w: 300, h: 300 };

  it("dragging the bottom-right grows w/h, anchoring the top-left", () => {
    const r = resizeRectFromCorner(start, "br", 40, 30, bounds);
    expect(r.x).toBe(50);
    expect(r.y).toBe(50);
    expect(r.width).toBe(140);
    expect(r.height).toBe(130);
  });

  it("dragging the top-left moves the origin, anchoring the bottom-right", () => {
    const r = resizeRectFromCorner(start, "tl", 20, 20, bounds);
    expect(r.x).toBe(70);
    expect(r.y).toBe(70);
    // right/bottom (150) stay put → width/height shrink.
    expect(r.x + r.width).toBe(150);
    expect(r.y + r.height).toBe(150);
  });

  it("never lets the dragged corner cross the minimum", () => {
    const r = resizeRectFromCorner(start, "br", -500, -500, bounds, 32);
    expect(r.width).toBeGreaterThanOrEqual(32);
    expect(r.height).toBeGreaterThanOrEqual(32);
  });
});

describe("moveRectWithin", () => {
  it("translates without changing size and clamps to bounds", () => {
    const r = moveRectWithin({ x: 10, y: 10, width: 50, height: 50 }, 1000, 1000, {
      w: 200,
      h: 200,
    });
    expect(r.width).toBe(50);
    expect(r.height).toBe(50);
    expect(r.x).toBe(150); // 200 - 50
    expect(r.y).toBe(150);
  });
});

describe("displayRectToSourceCrop", () => {
  it("scales a display rect up to source pixels", () => {
    // Source 2000×1000 rendered at 400×200 (scale 0.2). A display rect
    // (100,50,200,100) maps to source (500,250,1000,500).
    const crop = displayRectToSourceCrop(
      { x: 100, y: 50, width: 200, height: 100 },
      { w: 400, h: 200 },
      2000,
      1000
    );
    expect(crop).toEqual({ originX: 500, originY: 250, width: 1000, height: 500 });
  });

  it("clamps the crop inside the source bounds", () => {
    const crop = displayRectToSourceCrop(
      { x: 390, y: 0, width: 100, height: 200 },
      { w: 400, h: 200 },
      2000,
      1000
    );
    expect(crop.originX + crop.width).toBeLessThanOrEqual(2000);
    expect(crop.originY + crop.height).toBeLessThanOrEqual(1000);
    expect(crop.width).toBeGreaterThanOrEqual(1);
  });

  it("returns the full source on degenerate display dims", () => {
    const crop = displayRectToSourceCrop(
      { x: 0, y: 0, width: 0, height: 0 },
      { w: 0, h: 0 },
      2000,
      1000
    );
    expect(crop).toEqual({ originX: 0, originY: 0, width: 2000, height: 1000 });
  });
});
