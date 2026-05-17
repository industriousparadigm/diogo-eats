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

export function rotateCW(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}

export function rotateCCW(r: Rotation): Rotation {
  return ((r + 270) % 360) as Rotation;
}
