import { describe, it, expect } from "vitest";
import {
  effectiveDims,
  initialFitScale,
  clampOffset,
  rotateCW,
  rotateCCW,
} from "../cropMath";

describe("effectiveDims", () => {
  it("preserves dims for 0/180 rotation", () => {
    expect(effectiveDims(800, 600, 0)).toEqual({ w: 800, h: 600 });
    expect(effectiveDims(800, 600, 180)).toEqual({ w: 800, h: 600 });
  });
  it("swaps dims for 90/270 rotation", () => {
    expect(effectiveDims(800, 600, 90)).toEqual({ w: 600, h: 800 });
    expect(effectiveDims(800, 600, 270)).toEqual({ w: 600, h: 800 });
  });
});

describe("initialFitScale", () => {
  it("picks a scale that makes the image cover the crop frame (cover, not contain)", () => {
    // 800×600 image into a 400×400 frame:
    // cover = max(400/800, 400/600) = max(0.5, 0.667) = 0.667
    const s = initialFitScale(800, 600, 0, 400, 400);
    expect(s).toBeCloseTo(0.667, 2);
  });

  it("handles rotated dimensions correctly", () => {
    // 800×600 rotated 90° → effective 600×800
    // cover into 400×400: max(400/600, 400/800) = max(0.667, 0.5) = 0.667
    const s = initialFitScale(800, 600, 90, 400, 400);
    expect(s).toBeCloseTo(0.667, 2);
  });

  it("scale is always positive", () => {
    expect(initialFitScale(800, 600, 0, 400, 400)).toBeGreaterThan(0);
  });
});

describe("clampOffset", () => {
  // 800×600 image scaled to 0.5 = 400×300 effective. Frame 400×400.
  // Wider dim (400) exactly fits frame width → x must be 0.
  // Shorter dim (300) is smaller than frame height (400) → y free to move but
  // we ARE allowed to let smaller-than-frame dims stay at 0.
  it("clamps offset so image fully covers the frame on its big side", () => {
    const clamped = clampOffset(800, 600, 0, 1, 400, 400, { x: 999, y: 999 });
    // image scaled 1× = 800×600, frame 400×400
    // max x offset (pan-right): (imgW - frameW)/2 = (800-400)/2 = 200
    // max y offset (pan-down): (imgH - frameH)/2 = (600-400)/2 = 100
    expect(Math.abs(clamped.x)).toBeLessThanOrEqual(200);
    expect(Math.abs(clamped.y)).toBeLessThanOrEqual(100);
  });

  it("zero offset is always valid when image covers the frame", () => {
    const clamped = clampOffset(800, 600, 0, 1, 400, 400, { x: 0, y: 0 });
    expect(clamped).toEqual({ x: 0, y: 0 });
  });

  it("rotated image clamps on rotated dimensions", () => {
    // 800×600 rotated 90° → effective 600×800, scale 1 → frame 400×400
    // max x: (600-400)/2 = 100, max y: (800-400)/2 = 200
    const clamped = clampOffset(800, 600, 90, 1, 400, 400, { x: 999, y: 999 });
    expect(Math.abs(clamped.x)).toBeLessThanOrEqual(100);
    expect(Math.abs(clamped.y)).toBeLessThanOrEqual(200);
  });
});

describe("rotateCW / rotateCCW", () => {
  it("cycles 0 → 90 → 180 → 270 → 0", () => {
    expect(rotateCW(0)).toBe(90);
    expect(rotateCW(90)).toBe(180);
    expect(rotateCW(180)).toBe(270);
    expect(rotateCW(270)).toBe(0);
  });
  it("ccw cycles in reverse", () => {
    expect(rotateCCW(0)).toBe(270);
    expect(rotateCCW(90)).toBe(0);
    expect(rotateCCW(180)).toBe(90);
    expect(rotateCCW(270)).toBe(180);
  });
});
