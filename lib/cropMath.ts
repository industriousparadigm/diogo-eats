// Pure transform math for the photo crop sheet. The canvas rendering
// (which needs DOM APIs) lives in the component; everything that can be
// figured out from numbers alone lives here so it can be unit-tested.
//
// Coordinate convention: an image is rendered centered at (frameCx +
// offset.x, frameCy + offset.y), rotated by `rotation` degrees around
// that center, then scaled by `scale`. The crop frame is W×H centered
// at (0, 0) in the same coordinate system.

export type Rotation = 0 | 90 | 180 | 270;

export function effectiveDims(
  sourceW: number,
  sourceH: number,
  rotation: Rotation
): { w: number; h: number } {
  if (rotation === 90 || rotation === 270) return { w: sourceH, h: sourceW };
  return { w: sourceW, h: sourceH };
}

// "Cover" fit — the smallest scale that fully covers the frame on its
// limiting side. The user can zoom in further from here but not below.
export function initialFitScale(
  sourceW: number,
  sourceH: number,
  rotation: Rotation,
  frameW: number,
  frameH: number
): number {
  const { w, h } = effectiveDims(sourceW, sourceH, rotation);
  return Math.max(frameW / w, frameH / h);
}

// Clamp pan offset so the image continues to cover the crop frame on
// every side. If a dimension is smaller than the frame at this scale,
// that axis is pinned to 0 (image stays centered on it).
export function clampOffset(
  sourceW: number,
  sourceH: number,
  rotation: Rotation,
  scale: number,
  frameW: number,
  frameH: number,
  offset: { x: number; y: number }
): { x: number; y: number } {
  const { w, h } = effectiveDims(sourceW, sourceH, rotation);
  const renderedW = w * scale;
  const renderedH = h * scale;
  const maxX = Math.max(0, (renderedW - frameW) / 2);
  const maxY = Math.max(0, (renderedH - frameH) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  };
}

export function rotateCW(r: Rotation): Rotation {
  const next = ((r + 90) % 360) as Rotation;
  return next;
}

export function rotateCCW(r: Rotation): Rotation {
  const next = ((r + 270) % 360) as Rotation;
  return next;
}
