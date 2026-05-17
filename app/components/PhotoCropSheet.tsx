"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton, SheetShell } from "./sheet";
import {
  clampRectToBox,
  containedDisplayDims,
  displayRectToSourcePixels,
  effectiveDims,
  rotateCW,
  type Rect,
  type Rotation,
} from "@/lib/cropMath";
import { colors } from "@/lib/styles";

// Real crop: tap-and-drag a rectangle on the photo. Rotate in 90°
// steps. Apply renders that rectangle (at source resolution) into a
// new JPEG and hands it back as a File.
//
// Render model:
//   - Outer container: fixed display box (~80vw cap, ~70vh cap).
//   - Image: scaled-to-contain inside the container, rotated as needed.
//   - Crop rect: absolutely-positioned overlay in CSS pixels relative
//     to the rendered image's top-left. Eight handles for resize +
//     dragging the interior to move.
//
// Performance:
//   - Touch handlers only update state during the active gesture
//     (no continuous polling).
//   - The image is set as a CSS `background-image` on the cropped
//     region's reveal layer so we don't need two <img> elements to
//     show the dimmed-vs-bright contrast.

const CONTAINER_MAX_W = 360;
const CONTAINER_MAX_H = 480;
const HANDLE_SIZE = 28; // touch-friendly
const MIN_RECT = 48;
const OUTPUT_MAX_DIM = 2048;

type DragMode =
  | { kind: "move" }
  | { kind: "resize"; corner: "tl" | "tr" | "bl" | "br" };

export function PhotoCropSheet({
  file,
  onApply,
  onCancel,
}: {
  file: File;
  onApply: (cropped: File) => void;
  onCancel: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const [rotation, setRotation] = useState<Rotation>(0);
  const [container, setContainer] = useState<{ w: number; h: number }>({
    w: Math.min(CONTAINER_MAX_W, typeof window !== "undefined" ? window.innerWidth - 48 : CONTAINER_MAX_W),
    h: Math.min(CONTAINER_MAX_H, typeof window !== "undefined" ? Math.round(window.innerHeight * 0.6) : CONTAINER_MAX_H),
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = previewUrl;
  }, [previewUrl]);

  // Display dims of the (rotated) image inside the container.
  const display = useMemo(() => {
    if (!img) return { w: 0, h: 0 };
    const eff = effectiveDims(img.naturalWidth, img.naturalHeight, rotation);
    return containedDisplayDims(eff.w, eff.h, container.w, container.h);
  }, [img, rotation, container]);

  // Crop rect lives in display coords (relative to the displayed image's
  // top-left, NOT the container). Initialised to the full image; resets
  // whenever rotation or display changes.
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  useEffect(() => {
    if (display.w > 0 && display.h > 0) {
      setRect({ x: 0, y: 0, width: display.w, height: display.h });
    }
  }, [display.w, display.h]);

  const dragRef = useRef<{
    mode: DragMode | null;
    startX: number;
    startY: number;
    startRect: Rect;
  } | null>(null);

  const onTouchStart = useCallback(
    (mode: DragMode) => (e: React.TouchEvent | React.MouseEvent) => {
      const t = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
      dragRef.current = {
        mode,
        startX: t.clientX,
        startY: t.clientY,
        startRect: { ...rect },
      };
    },
    [rect]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent | MouseEvent) => {
      const ds = dragRef.current;
      if (!ds || !ds.mode) return;
      e.preventDefault();
      const t = "touches" in e ? e.touches[0] : (e as MouseEvent);
      const dx = t.clientX - ds.startX;
      const dy = t.clientY - ds.startY;
      const s = ds.startRect;
      let next: Rect = s;
      if (ds.mode.kind === "move") {
        next = { x: s.x + dx, y: s.y + dy, width: s.width, height: s.height };
      } else {
        const c = ds.mode.corner;
        const minX = c === "tl" || c === "bl" ? s.x + s.width - MIN_RECT : s.x;
        const minY = c === "tl" || c === "tr" ? s.y + s.height - MIN_RECT : s.y;
        const maxX = c === "tr" || c === "br" ? s.x + MIN_RECT : 0;
        const maxY = c === "bl" || c === "br" ? s.y + MIN_RECT : 0;
        if (c === "tl") {
          const nx = Math.min(minX, Math.max(0, s.x + dx));
          const ny = Math.min(minY, Math.max(0, s.y + dy));
          next = { x: nx, y: ny, width: s.width + (s.x - nx), height: s.height + (s.y - ny) };
        } else if (c === "tr") {
          const nw = Math.max(MIN_RECT, s.width + dx);
          const ny = Math.min(minY, Math.max(0, s.y + dy));
          next = { x: s.x, y: ny, width: nw, height: s.height + (s.y - ny) };
          void maxX;
        } else if (c === "bl") {
          const nx = Math.min(minX, Math.max(0, s.x + dx));
          const nh = Math.max(MIN_RECT, s.height + dy);
          next = { x: nx, y: s.y, width: s.width + (s.x - nx), height: nh };
          void maxY;
        } else {
          const nw = Math.max(MIN_RECT, s.width + dx);
          const nh = Math.max(MIN_RECT, s.height + dy);
          next = { x: s.x, y: s.y, width: nw, height: nh };
        }
      }
      setRect(clampRectToBox(next, display, MIN_RECT));
    },
    [display]
  );

  const onTouchEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    const move = (e: TouchEvent | MouseEvent) => onTouchMove(e);
    const end = () => onTouchEnd();
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    return () => {
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
    };
  }, [onTouchMove, onTouchEnd]);

  async function apply() {
    if (!img || busy) return;
    setBusy(true);
    try {
      const src = displayRectToSourcePixels(
        rect,
        display,
        img.naturalWidth,
        img.naturalHeight,
        rotation
      );
      const k = Math.min(1, OUTPUT_MAX_DIM / Math.max(src.width, src.height));
      const outW = Math.max(1, Math.round(src.width * k));
      const outH = Math.max(1, Math.round(src.height * k));

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no ctx");

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, outW, outH);

      // Apply rotation around the canvas centre + then drawImage from
      // the requested SOURCE rectangle.
      ctx.save();
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      // After rotation, the source rect goes onto a -outW/2..outW/2 box.
      // For 90/270, swap output dims for the drawImage step.
      const drawW = rotation === 90 || rotation === 270 ? outH : outW;
      const drawH = rotation === 90 || rotation === 270 ? outW : outH;
      ctx.drawImage(
        img,
        src.x,
        src.y,
        src.width,
        src.height,
        -drawW / 2,
        -drawH / 2,
        drawW,
        drawH
      );
      ctx.restore();

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.9)
      );
      if (!blob) throw new Error("toBlob failed");
      const name = file.name.replace(/\.[^.]+$/, "") + "-cropped.jpg";
      onApply(new File([blob], name, { type: "image/jpeg" }));
    } catch {
      setBusy(false);
    }
  }

  // Layout: image rendered at (containerX, containerY) inside the
  // outer container, centered. The crop overlay is positioned relative
  // to that image position (offsetX, offsetY).
  const offsetX = Math.max(0, (container.w - display.w) / 2);
  const offsetY = Math.max(0, (container.h - display.h) / 2);

  return (
    <SheetShell onScrimClick={onCancel} maxHeightVh={94}>
      <div
        style={{
          fontSize: 12,
          color: colors.textSubtle,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Crop · rotate
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "4px 0",
        }}
      >
        {!img ? (
          <div
            style={{
              width: container.w,
              height: container.h,
              background: "#0a0a0a",
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: colors.textFaint,
              fontSize: 12,
            }}
          >
            loading…
          </div>
        ) : (
          <div
            style={{
              width: container.w,
              height: container.h,
              position: "relative",
              background: "#000",
              borderRadius: 8,
              overflow: "hidden",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <img
              src={previewUrl}
              alt="crop preview"
              draggable={false}
              style={{
                position: "absolute",
                left: offsetX,
                top: offsetY,
                width:
                  rotation === 90 || rotation === 270 ? display.h : display.w,
                height:
                  rotation === 90 || rotation === 270 ? display.w : display.h,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: "center center",
                // Position correction for 90/270: with transformOrigin
                // at the centre of the natural (unrotated) bounding
                // box, the rotated image's bounding box still sits at
                // (offsetX, offsetY) once we apply the swapped W/H above.
                ...(rotation === 90 || rotation === 270
                  ? {
                      left: offsetX - (display.h - display.w) / 2,
                      top: offsetY - (display.w - display.h) / 2,
                    }
                  : {}),
                pointerEvents: "none",
                WebkitUserSelect: "none",
              }}
            />

            {/* Dim outside the crop rect with four CSS masks. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background: "rgba(0,0,0,0.45)",
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${offsetX + rect.x}px ${offsetY + rect.y}px, ${offsetX + rect.x}px ${offsetY + rect.y + rect.height}px, ${offsetX + rect.x + rect.width}px ${offsetY + rect.y + rect.height}px, ${offsetX + rect.x + rect.width}px ${offsetY + rect.y}px, ${offsetX + rect.x}px ${offsetY + rect.y}px)`,
              }}
            />

            {/* Crop rect with handles. */}
            <div
              onTouchStart={onTouchStart({ kind: "move" })}
              onMouseDown={onTouchStart({ kind: "move" })}
              style={{
                position: "absolute",
                left: offsetX + rect.x,
                top: offsetY + rect.y,
                width: rect.width,
                height: rect.height,
                border: `2px solid ${colors.accentBright}`,
                boxSizing: "border-box",
                cursor: "move",
              }}
            >
              {(
                [
                  { c: "tl", style: { left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 } },
                  { c: "tr", style: { right: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 } },
                  { c: "bl", style: { left: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 } },
                  { c: "br", style: { right: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 } },
                ] as const
              ).map(({ c, style }) => (
                <div
                  key={c}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    onTouchStart({ kind: "resize", corner: c })(e);
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onTouchStart({ kind: "resize", corner: c })(e);
                  }}
                  style={{
                    position: "absolute",
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    borderRadius: HANDLE_SIZE / 2,
                    background: colors.accentBright,
                    border: "2px solid #0a0a0a",
                    boxSizing: "border-box",
                    cursor: "nwse-resize",
                    ...style,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          onClick={() => setRotation((r) => rotateCW(r))}
          disabled={!img || busy}
          style={{
            background: "transparent",
            color: colors.textMuted,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          ↻ rotate
        </button>
        <button
          onClick={() => {
            if (display.w > 0 && display.h > 0)
              setRect({ x: 0, y: 0, width: display.w, height: display.h });
          }}
          disabled={!img || busy}
          style={{
            background: "transparent",
            color: colors.textMuted,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          reset
        </button>
        <div
          style={{
            fontSize: 10,
            color: colors.textFaint,
            letterSpacing: 0.3,
            marginLeft: 4,
          }}
        >
          drag corners to crop · drag inside to move
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <SecondaryButton onClick={onCancel}>cancel</SecondaryButton>
        <PrimaryButton onClick={apply} disabled={!img || busy} flex>
          {busy ? "applying…" : "apply"}
        </PrimaryButton>
      </div>
    </SheetShell>
  );
}
