"use client";

import { useEffect } from "react";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

// Fullscreen image viewer. Renders a dark scrim with the image fit to
// the viewport (object-fit: contain). Tap anywhere / Esc / swipe down
// closes it. Used for inspecting meal photos at full resolution — the
// MealCard and meal-detail view both show cropped/clamped previews
// that can hide important detail (a label, a portion size).
export function PhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  useBodyScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Touch-drag-down to dismiss: a soft gesture that feels right on iOS
  // where the "back" affordance lives at the top of the screen. Threshold
  // of ~80px of downward motion triggers close.
  let startY: number | null = null;
  function onTouchStart(e: React.TouchEvent) {
    startY = e.touches[0]?.clientY ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startY == null) return;
    const endY = e.changedTouches[0]?.clientY ?? startY;
    if (endY - startY > 80) onClose();
    startY = null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="full-size photo"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 70,
        padding: 12,
      }}
    >
      <img
        src={src}
        alt={alt ?? ""}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          borderRadius: 8,
          // Stop the image's own click from re-firing onClose — but only
          // when the user dragged a long press; simple tap still closes.
        }}
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="close"
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top))",
          right: 12,
          width: 36,
          height: 36,
          borderRadius: 999,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          border: "none",
          fontSize: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
