"use client";

import type React from "react";

// Bottom-fixed action bar. Two equally-weighted buttons: photo and write.
// Always available — even while previous logs are still being parsed.
// The pending placeholder cards in the today list are the visible
// "something is happening" signal; the bar stays out of their way.
export function ActionBar({
  inputId,
  onType,
}: {
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
    background: "#65a30d",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    fontSize: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    color: "#fff",
    border: "none",
  };

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
