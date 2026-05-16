"use client";

import { useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton, SheetShell } from "./sheet";
import {
  clampOffset,
  effectiveDims,
  initialFitScale,
  rotateCW,
  type Rotation,
} from "@/lib/cropMath";
import { colors } from "@/lib/styles";

// Crop / rotate / zoom sheet. Opens from a thumbnail tap in ConfirmSheet.
// Three gestures:
//   - one-finger drag → pan
//   - two-finger pinch → zoom
//   - rotate button → 90° CW (camera saves sideways way too often)
//
// On apply, the visible portion of the frame is rendered to a JPEG and
// the source File is replaced.

const FRAME_MAX = 380; // px — used for screen layout, not output dimensions
const OUTPUT_MAX_DIM = 2048;
const ZOOM_MAX_FACTOR = 5; // max scale relative to initial-fit (cover)

type Transform = {
  scale: number;
  rotation: Rotation;
  offset: { x: number; y: number };
};

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
  const [previewUrl] = useState(() => URL.createObjectURL(file));
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    rotation: 0,
    offset: { x: 0, y: 0 },
  });
  const [busy, setBusy] = useState(false);

  // Gesture state — refs so we don't re-render mid-drag.
  const dragState = useRef<{
    mode: "pan" | "pinch" | null;
    startTouches: { id: number; x: number; y: number }[];
    startTransform: Transform;
  }>({ mode: null, startTouches: [], startTransform: transform });

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = previewUrl;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Compute the crop frame size from the source image aspect ratio,
  // capped at FRAME_MAX. Re-runs on rotation since effective aspect flips.
  useEffect(() => {
    if (!img) return;
    const { w: ew, h: eh } = effectiveDims(
      img.naturalWidth,
      img.naturalHeight,
      transform.rotation
    );
    const aspect = ew / eh;
    let fw = Math.min(FRAME_MAX, window.innerWidth - 48);
    let fh = fw / aspect;
    if (fh > FRAME_MAX) {
      fh = FRAME_MAX;
      fw = fh * aspect;
    }
    setFrame({ w: fw, h: fh });

    // Reset to cover-fit when rotation changes.
    const initial = initialFitScale(
      img.naturalWidth,
      img.naturalHeight,
      transform.rotation,
      fw,
      fh
    );
    setTransform((t) => ({
      ...t,
      scale: initial,
      offset: { x: 0, y: 0 },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, transform.rotation]);

  function onTouchStart(e: React.TouchEvent) {
    if (!img || !frame) return;
    const ts = Array.from(e.touches).map((t) => ({
      id: t.identifier,
      x: t.clientX,
      y: t.clientY,
    }));
    dragState.current = {
      mode: ts.length >= 2 ? "pinch" : "pan",
      startTouches: ts,
      startTransform: transform,
    };
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!img || !frame) return;
    e.preventDefault();
    const ds = dragState.current;
    if (!ds.mode || ds.startTouches.length === 0) return;

    if (ds.mode === "pan" && e.touches.length === 1) {
      const t = e.touches[0];
      const start = ds.startTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const clamped = clampOffset(
        img.naturalWidth,
        img.naturalHeight,
        ds.startTransform.rotation,
        ds.startTransform.scale,
        frame.w,
        frame.h,
        { x: ds.startTransform.offset.x + dx, y: ds.startTransform.offset.y + dy }
      );
      setTransform({ ...ds.startTransform, offset: clamped });
    } else if (ds.mode === "pinch" && e.touches.length >= 2 && ds.startTouches.length >= 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const s1 = ds.startTouches[0];
      const s2 = ds.startTouches[1];
      const startDist = Math.hypot(s1.x - s2.x, s1.y - s2.y);
      const nowDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (startDist === 0) return;
      const factor = nowDist / startDist;
      const minScale = initialFitScale(
        img.naturalWidth,
        img.naturalHeight,
        ds.startTransform.rotation,
        frame.w,
        frame.h
      );
      const newScale = Math.max(
        minScale,
        Math.min(minScale * ZOOM_MAX_FACTOR, ds.startTransform.scale * factor)
      );
      // Pan offset needs re-clamping at the new scale.
      const clamped = clampOffset(
        img.naturalWidth,
        img.naturalHeight,
        ds.startTransform.rotation,
        newScale,
        frame.w,
        frame.h,
        ds.startTransform.offset
      );
      setTransform({ ...ds.startTransform, scale: newScale, offset: clamped });
    }
  }

  function onTouchEnd() {
    dragState.current.mode = null;
  }

  function onRotate() {
    setTransform((t) => ({ ...t, rotation: rotateCW(t.rotation) }));
  }

  async function apply() {
    if (!img || !frame || busy) return;
    setBusy(true);
    try {
      const outW = Math.min(OUTPUT_MAX_DIM, Math.round(frame.w * 2));
      const outH = Math.round(outW * (frame.h / frame.w));
      const k = outW / frame.w;

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d ctx");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, outW, outH);
      ctx.save();
      ctx.translate(
        outW / 2 + transform.offset.x * k,
        outH / 2 + transform.offset.y * k
      );
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.scale(transform.scale * k, transform.scale * k);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.9)
      );
      if (!blob) throw new Error("toBlob failed");

      const name = file.name.replace(/\.[^.]+$/, "") + "-cropped.jpg";
      const out = new File([blob], name, { type: "image/jpeg" });
      onApply(out);
    } catch {
      // Best effort — fail silently and let the user retry.
      setBusy(false);
    }
  }

  return (
    <SheetShell onScrimClick={onCancel} maxHeightVh={92}>
      <div
        style={{
          fontSize: 12,
          color: colors.textSubtle,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Crop · rotate · zoom
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "8px 0",
        }}
      >
        {!img || !frame ? (
          <div
            style={{
              width: FRAME_MAX,
              height: FRAME_MAX,
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
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            style={{
              width: frame.w,
              height: frame.h,
              overflow: "hidden",
              position: "relative",
              background: "#000",
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
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
                top: "50%",
                left: "50%",
                width: img.naturalWidth,
                height: img.naturalHeight,
                maxWidth: "none",
                maxHeight: "none",
                transform: `translate(calc(-50% + ${transform.offset.x}px), calc(-50% + ${transform.offset.y}px)) rotate(${transform.rotation}deg) scale(${transform.scale})`,
                transformOrigin: "center center",
                pointerEvents: "none",
                WebkitUserSelect: "none",
              }}
            />
            {/* Subtle inner grid for composition reference */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "linear-gradient(to right, transparent 33%, rgba(255,255,255,0.12) 33%, rgba(255,255,255,0.12) 33.3%, transparent 33.3%, transparent 66.6%, rgba(255,255,255,0.12) 66.6%, rgba(255,255,255,0.12) 66.9%, transparent 66.9%), linear-gradient(to bottom, transparent 33%, rgba(255,255,255,0.12) 33%, rgba(255,255,255,0.12) 33.3%, transparent 33.3%, transparent 66.6%, rgba(255,255,255,0.12) 66.6%, rgba(255,255,255,0.12) 66.9%, transparent 66.9%)",
              }}
            />
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <button
          onClick={onRotate}
          aria-label="rotate 90 degrees"
          disabled={!img || busy}
          style={{
            background: "transparent",
            color: colors.textMuted,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ↻ rotate
        </button>
        <div
          style={{
            fontSize: 10,
            color: colors.textFaint,
            letterSpacing: 0.3,
            paddingLeft: 8,
          }}
        >
          pinch to zoom · drag to pan
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
