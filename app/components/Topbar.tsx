"use client";

import Link from "next/link";
import type React from "react";
import { colors } from "@/lib/styles";

// Persistent top-of-page nav. Sits above the date scroller and stays
// non-sticky — it scrolls away with content. Three actions live here:
//   - Overview → /overview (the looking-back surface, was buried at
//     the bottom of the home History calendar in earlier iterations)
//   - Settings → opens the SettingsSheet
//   - Account → placeholder for the upcoming login + multi-user work;
//     opens a small "coming soon" note for now
//
// Wordmark on the left, icons on the right.
export function Topbar({
  onOpenSettings,
  onOpenAccount,
}: {
  onOpenSettings: () => void;
  onOpenAccount: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "2px 0 14px 0",
        marginBottom: 14,
        borderBottom: `1px solid ${colors.border}`,
        gap: 8,
      }}
    >
      <Link href="/" aria-label="eats home" style={wordmarkStyle}>
        EATS
      </Link>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Link href="/overview" style={overviewBtnStyle}>
          OVERVIEW
        </Link>
        <IconButton onClick={onOpenSettings} label="settings">
          <GearIcon />
        </IconButton>
        <IconButton onClick={onOpenAccount} label="account">
          <PersonIcon />
        </IconButton>
      </nav>
    </div>
  );
}

function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        background: "transparent",
        border: `1px solid ${colors.border}`,
        color: colors.textMuted,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM13.6 9.4l1.4 1-1.4 2.4-1.7-.5a5.6 5.6 0 01-1.5.9l-.4 1.7H7.0l-.4-1.7a5.6 5.6 0 01-1.5-.9l-1.7.5L2 10.4l1.4-1a5.6 5.6 0 010-1.7L2 6.6 3.4 4.2l1.7.5a5.6 5.6 0 011.5-.9l.4-1.8h3l.4 1.7c.55.22 1.06.52 1.5.9l1.7-.5L15 6.6l-1.4 1a5.6 5.6 0 010 1.7z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M2.8 13.3c.8-2.4 2.9-3.6 5.2-3.6s4.4 1.2 5.2 3.6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

const wordmarkStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 2,
  color: colors.text,
  textDecoration: "none",
  WebkitTapHighlightColor: "transparent",
};

const overviewBtnStyle: React.CSSProperties = {
  background: "rgba(132,204,22,0.10)",
  color: "#bef264",
  border: "1px solid rgba(132,204,22,0.30)",
  borderRadius: 999,
  padding: "5px 11px",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: 0.5,
  textDecoration: "none",
  WebkitTapHighlightColor: "transparent",
  whiteSpace: "nowrap",
};
