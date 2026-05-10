"use client";

import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import type React from "react";

// Generic bottom-sheet shell + a couple of standard buttons. All three
// modal sheets in the app (confirm, text, settings) are built on top of
// SheetShell. PrimaryButton + SecondaryButton give the same visual
// language across the app's CTAs.

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
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
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
          maxHeight: `${maxHeightVh ?? 80}vh`,
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
