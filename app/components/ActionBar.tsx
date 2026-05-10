"use client";

import type React from "react";

// Bottom-fixed action bar. Two equally-weighted buttons: photo and write.
// The single jade FAB used to occlude content when scrolled and quietly
// nudged users toward photo even when the type-flow was the one they
// wanted. Two equal buttons makes the choice symmetric.
//
// On a busy state (parse in progress) the bar collapses to a single
// status indicator so neither input can fire mid-parse.
export function ActionBar({
  busy,
  inputId,
  onType,
}: {
  busy: boolean;
  inputId: string;
  onType: () => void;
}) {
  const wrap: React.CSSProperties = {
    position: "fixed",
    bottom: "max(28px, env(safe-area-inset-bottom))",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 14,
    zIndex: 40,
  };
  const btn: React.CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: busy ? "#3f3f46" : "#65a30d",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    fontSize: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: busy ? "default" : "pointer",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    color: "#fff",
    border: "none",
  };

  if (busy) {
    return (
      <div style={wrap}>
        <div role="status" aria-label="processing" style={btn}>
          …
        </div>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <label htmlFor={inputId} aria-label="snap meal" style={btn}>
        📷
      </label>
      <button onClick={onType} aria-label="type a meal" style={btn}>
        ✏️
      </button>
    </div>
  );
}
