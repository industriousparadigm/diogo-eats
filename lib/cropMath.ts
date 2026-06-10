// Pure transform math for the photo crop sheet.
//
// New model (May 2026 rewrite): the user can drag a rectangle of any
// size/aspect inside the (optionally rotated) image. We render the
// image scaled-to-contain inside a fixed container, then track the
// crop rect in DISPLAY coordinates (CSS pixels relative to the
// rendered image's top-left). On apply, we translate display coords
// back to source-image pixel coords so the canvas crop captures the
// correct region at full resolution.
//
// The previous "pan + pinch-zoom inside a fixed frame" model is
// retained at the hook layer as a fallback when touch events aren't
// available, but the primary interaction is rectangle selection.

export type Rotation = 0 | 90 | 180 | 270;

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// effectiveDims = source dims after rotation (90/270 swap w↔h).
export function effectiveDims(
  sourceW: number,
  sourceH: number,
  rotation: Rotation
): { w: number; h: number } {
  if (rotation === 90 || rotation === 270) return { w: sourceH, h: sourceW };
  return { w: sourceW, h: sourceH };
}

// Given the rendered image's display dimensions (after `object-fit:
// contain` scaling), return the scale factor relative to the source.
// Equal in both axes because contain preserves aspect.
export function displayScale(
  effectiveW: number,
  displayW: number
): number {
  if (effectiveW <= 0) return 1;
  return displayW / effectiveW;
}

// Compute the rendered display dimensions of an image with
// `object-fit: contain` inside a container of containerW × containerH.
export function containedDisplayDims(
  effectiveW: number,
  effectiveH: number,
  containerW: number,
  containerH: number
): { w: number; h: number } {
  if (effectiveW <= 0 || effectiveH <= 0) return { w: 0, h: 0 };
  const scale = Math.min(
    containerW / effectiveW,
    containerH / effectiveH
  );
  return {
    w: Math.round(effectiveW * scale),
    h: Math.round(effectiveH * scale),
  };
}

// Clamp a Rect to live entirely inside a 0..bounds.w / 0..bounds.h
// box. Useful after a corner-drag so the crop rect can't escape the
// visible image.
export function clampRectToBox(
  r: Rect,
  bounds: { w: number; h: number },
  min: number = 24
): Rect {
  let { x, y, width, height } = r;
  // Width/height must each be ≥ min and fit inside bounds.
  width = Math.max(min, Math.min(width, bounds.w));
  height = Math.max(min, Math.min(height, bounds.h));
  x = Math.max(0, Math.min(x, bounds.w - width));
  y = Math.max(0, Math.min(y, bounds.h - height));
  return { x, y, width, height };
}

// Translate a Rect from DISPLAY coordinates (relative to the rendered
// rotated image) into SOURCE PIXEL coordinates (the original image's
// orientation, before rotation). Used by the canvas applyCrop step.
export function displayRectToSourcePixels(
  displayRect: Rect,
  displayDims: { w: number; h: number },
  sourceW: number,
  sourceH: number,
  rotation: Rotation
): Rect {
  const eff = effectiveDims(sourceW, sourceH, rotation);
  // Scale from display → effective (rotated) pixels.
  const sx = eff.w / displayDims.w;
  const sy = eff.h / displayDims.h;
  const ex = displayRect.x * sx;
  const ey = displayRect.y * sy;
  const ew = displayRect.width * sx;
  const eh = displayRect.height * sy;

  // De-rotate from effective space back to source space. The effective
  // rectangle (ex, ey, ew, eh) is in the rotated image's coordinate
  // frame; we need to figure out which source-pixel rectangle that
  // corresponds to.
  switch (rotation) {
    case 0:
      return { x: ex, y: ey, width: ew, height: eh };
    case 90:
      // Effective frame is sourceH wide × sourceW tall; rotated 90° CW
      // from source. A point (ex, ey) in effective came from source
      // pixel (ey, sourceH - 1 - ex). For a rect, the corner mapping
      // gives this transform:
      return {
        x: ey,
        y: sourceH - ex - ew,
        width: eh,
        height: ew,
      };
    case 180:
      return {
        x: sourceW - ex - ew,
        y: sourceH - ey - eh,
        width: ew,
        height: eh,
      };
    case 270:
      return {
        x: sourceW - ey - eh,
        y: ex,
        width: eh,
        height: ew,
      };
  }
}

export type Corner = "tl" | "tr" | "bl" | "br";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Resize from one corner, anchoring the opposite corner. The dragged
// edges are clamped to the bounds and the minimum size; the anchored
// edges NEVER move. (The previous clampRectToBox-after-resize approach
// could relocate the whole rect when a corner was dragged past the
// boundary — dragging the bottom-right handle shoved the rect left.)
export function resizeRectFromCorner(
  start: Rect,
  corner: Corner,
  dx: number,
  dy: number,
  bounds: { w: number; h: number },
  min: number = 24
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

// Canvas geometry for rendering a crop. The canvas takes the dimensions
// of the crop AS DISPLAYED (rotated), while the drawImage destination
// box keeps the SOURCE aspect — uniform scale — and the ctx rotation
// maps one onto the other. Getting either side wrong stretches the
// output: the pre-June-2026 code kept the canvas at source dims and
// swapped the draw box instead, so every 90°/270° crop shipped
// distorted with the wrong aspect.
export function cropOutputGeometry(
  srcRect: { width: number; height: number },
  rotation: Rotation,
  maxDim: number
): { canvasW: number; canvasH: number; drawW: number; drawH: number } {
  const k = Math.min(1, maxDim / Math.max(srcRect.width, srcRect.height));
  const drawW = Math.max(1, Math.round(srcRect.width * k));
  const drawH = Math.max(1, Math.round(srcRect.height * k));
  const swap = rotation === 90 || rotation === 270;
  return {
    canvasW: swap ? drawH : drawW,
    canvasH: swap ? drawW : drawH,
    drawW,
    drawH,
  };
}

export function rotateCW(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}

export function rotateCCW(r: Rotation): Rotation {
  return ((r + 270) % 360) as Rotation;
}
