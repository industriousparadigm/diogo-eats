// Pure crop geometry for the native photo crop sheet.
//
// Model (RN, no rotation — expo-image-manipulator handles the actual
// pixel crop): the source image is rendered scaled-to-contain inside a
// fixed container. The user drags a rectangle in DISPLAY coordinates
// (points relative to the rendered image's top-left). On apply we map that
// display rect into SOURCE pixel coordinates and hand it to
// ImageManipulator.manipulateAsync([{ crop: { originX, originY, width, height } }]).
//
// This mirrors the web's cropMath conceptually (display→source mapping,
// contain scaling, corner-resize, clamp) but stays gesture-library-free:
// the screen feeds it numbers from PanResponder, never window listeners.

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Rendered dimensions of an image with object-fit: contain inside a
// container of containerW × containerH. Equal scale in both axes.
export function containedDisplayDims(
  sourceW: number,
  sourceH: number,
  containerW: number,
  containerH: number
): { w: number; h: number; scale: number } {
  if (sourceW <= 0 || sourceH <= 0) return { w: 0, h: 0, scale: 1 };
  const scale = Math.min(containerW / sourceW, containerH / sourceH);
  return {
    w: Math.round(sourceW * scale),
    h: Math.round(sourceH * scale),
    scale,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Clamp a display-space Rect to live entirely inside the rendered image
// box (0..bounds.w / 0..bounds.h), keeping each side ≥ min.
export function clampRectToBox(
  r: Rect,
  bounds: { w: number; h: number },
  min: number = 32
): Rect {
  let { x, y, width, height } = r;
  width = Math.max(min, Math.min(width, bounds.w));
  height = Math.max(min, Math.min(height, bounds.h));
  x = Math.max(0, Math.min(x, bounds.w - width));
  y = Math.max(0, Math.min(y, bounds.h - height));
  return { x, y, width, height };
}

export type Corner = "tl" | "tr" | "bl" | "br";

// Resize from one corner, anchoring the opposite corner. The dragged
// edges clamp to bounds + minimum; the anchored edges never move. (Same
// fix the web shipped — clamp-after-resize could shove the whole rect.)
export function resizeRectFromCorner(
  start: Rect,
  corner: Corner,
  dx: number,
  dy: number,
  bounds: { w: number; h: number },
  min: number = 32
): Rect {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  let { x, y, width, height } = start;

  if (corner === "tl" || corner === "bl") {
    x = clamp(start.x + dx, 0, right - min);
    width = right - x;
  } else {
    width = clamp(start.width + dx, min, bounds.w - start.x);
  }
  if (corner === "tl" || corner === "tr") {
    y = clamp(start.y + dy, 0, bottom - min);
    height = bottom - y;
  } else {
    height = clamp(start.height + dy, min, bounds.h - start.y);
  }
  return { x, y, width, height };
}

// Translate a rect inside bounds; size never changes.
export function moveRectWithin(
  start: Rect,
  dx: number,
  dy: number,
  bounds: { w: number; h: number }
): Rect {
  return {
    x: clamp(start.x + dx, 0, bounds.w - start.width),
    y: clamp(start.y + dy, 0, bounds.h - start.height),
    width: start.width,
    height: start.height,
  };
}

// Map a DISPLAY-space rect (relative to the rendered, contained image)
// into SOURCE-pixel coordinates for expo-image-manipulator's crop. The
// result is clamped to the source bounds and rounded to whole pixels
// (the manipulator rejects fractional / out-of-bounds crops).
export function displayRectToSourceCrop(
  displayRect: Rect,
  displayDims: { w: number; h: number },
  sourceW: number,
  sourceH: number
): { originX: number; originY: number; width: number; height: number } {
  if (displayDims.w <= 0 || displayDims.h <= 0) {
    return { originX: 0, originY: 0, width: sourceW, height: sourceH };
  }
  const sx = sourceW / displayDims.w;
  const sy = sourceH / displayDims.h;
  let originX = Math.round(displayRect.x * sx);
  let originY = Math.round(displayRect.y * sy);
  let width = Math.round(displayRect.width * sx);
  let height = Math.round(displayRect.height * sy);

  originX = clamp(originX, 0, Math.max(0, sourceW - 1));
  originY = clamp(originY, 0, Math.max(0, sourceH - 1));
  width = clamp(width, 1, sourceW - originX);
  height = clamp(height, 1, sourceH - originY);
  return { originX, originY, width, height };
}
