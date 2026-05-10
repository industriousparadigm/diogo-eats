"use client";

import { useEffect, useState } from "react";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import type React from "react";

// Generic bottom-sheet shell + a couple of standard buttons. All three
// modal sheets in the app (confirm, text, settings) are built on top of
// SheetShell. PrimaryButton + SecondaryButton give the same visual
// language across the app's CTAs.
//
// iOS keyboard handling: position:fixed elements pin to the LAYOUT
// viewport on iOS, not the visible viewport — so when the keyboard pops
// up, a flex-end-anchored sheet ends up BEHIND the keyboard. Fix is to
// track window.visualViewport and size+offset the scrim to the visible
// area. This makes flex-end land the panel just above the keyboard,
// which is what the user expects from a "type what you ate" sheet.

type Viewport = { height: number; offsetTop: number };

function useVisualViewport(): Viewport | null {
  const [vp, setVp] = useState<Viewport | null>(null);
  useEffect(() => {
    const v = typeof window !== "undefined" ? window.visualViewport : null;
    if (!v) return;
    const update = () => setVp({ height: v.height, offsetTop: v.offsetTop });
    update();
    v.addEventListener("resize", update);
    v.addEventListener("scroll", update);
    return () => {
      v.removeEventListener("resize", update);
      v.removeEventListener("scroll", update);
    };
  }, []);
  return vp;
}

export function SheetShell({
  children,
  onScrimClick,
  maxHeightVh,
}: {
  children: React.ReactNode;
  onScrimClick?: () => void;
  maxHeightVh?: number;
}) {
  // Lock body scroll while the sheet is mounted. Without this, iOS
  // Safari scrolls the underlying page when the user drags inside the
  // sheet — background goes first, sheet content second. Disorienting.
  useBodyScrollLock(true);
  const vp = useVisualViewport();

  // Default to fullscreen if visualViewport isn't supported (older
  // browsers, SSR). Keyboard cases will only adapt where the API exists.
  const containerStyle: React.CSSProperties = vp
    ? {
        position: "fixed",
        top: vp.offsetTop,
        left: 0,
        width: "100%",
        height: vp.height,
      }
    : { position: "fixed", inset: 0 };

  // Inner panel height: cap to a fraction of the available area so a
  // long sheet can't push the title off-screen. With visualViewport
  // active this is "fraction of the visible area"; without, "fraction
  // of the layout viewport" (close enough on desktop).
  const heightCap = Math.round((maxHeightVh ?? 80) * (vp?.height ?? 0) / 100);
  const innerMaxHeight = vp ? `${heightCap}px` : `${maxHeightVh ?? 80}vh`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        ...containerStyle,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onScrimClick) onScrimClick();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        style={{
          background: "#0a0a0a",
          width: "100%",
          maxWidth: 540,
          maxHeight: innerMaxHeight,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 16,
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  flex,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  flex?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: flex ? 1 : undefined,
        background: disabled ? "#3f3f46" : "#65a30d",
        color: "#fff",
        padding: "12px 16px",
        fontSize: 14,
        fontWeight: 500,
        borderRadius: 8,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        color: "#a1a1aa",
        padding: "12px 16px",
        fontSize: 14,
        border: "1px solid #27272a",
        borderRadius: 8,
      }}
    >
      {children}
    </button>
  );
}
