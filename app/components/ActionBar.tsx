"use client";

import Link from "next/link";
import type React from "react";

// Single-action floating bar at the bottom of the home page. One big
// pill that links to /log — the unified capture screen where the user
// can attach photos OR type, all in one flow. The old two-button
// (camera vs pencil) split is gone; one entry point, less choice,
// cleaner mental model.
export function ActionBar({ dayHint, href }: { dayHint?: string; href: string }) {
  const wrap: React.CSSProperties = {
    position: "fixed",
    bottom: "max(28px, env(safe-area-inset-bottom))",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    zIndex: 40,
  };
  const hint: React.CSSProperties = {
    fontSize: 11,
    color: "#a3a3a3",
    background: "rgba(15,15,17,0.85)",
    padding: "4px 10px",
    borderRadius: 999,
    letterSpacing: 0.5,
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  };
  const cta: React.CSSProperties = {
    background: "#65a30d",
    color: "#fff",
    fontSize: 16,
    fontWeight: 500,
    letterSpacing: 0.5,
    padding: "14px 28px",
    borderRadius: 999,
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    textDecoration: "none",
    userSelect: "none",
  };
  return (
    <div style={wrap}>
      {dayHint && <div style={hint}>Logging for {dayHint}</div>}
      <Link href={href} style={cta} aria-label="log a meal">
        <span aria-hidden style={{ fontSize: 18 }}>＋</span>
        LOG
      </Link>
    </div>
  );
}
