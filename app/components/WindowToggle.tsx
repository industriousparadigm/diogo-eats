"use client";

import type React from "react";
import { colors, radii } from "@/lib/styles";

// Segmented toggle for the overview window. Three options — short
// review (7d), monthly view (30d), longer trend (90d).
export function WindowToggle({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div role="tablist" style={wrap}>
      {OPTIONS.map((opt) => {
        const active = opt.days === value;
        return (
          <button
            key={opt.days}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.days)}
            style={{
              ...btn,
              background: active ? colors.surfaceMuted : "transparent",
              color: active ? colors.text : colors.textSubtle,
              boxShadow: active ? `inset 0 0 0 1px ${colors.borderStrong}` : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const OPTIONS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

const wrap: React.CSSProperties = {
  display: "inline-flex",
  background: colors.surfaceAlt,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  padding: 3,
  gap: 2,
};
const btn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  letterSpacing: 0.3,
  fontVariantNumeric: "tabular-nums",
  transition: "background 120ms ease, color 120ms ease",
  WebkitTapHighlightColor: "transparent",
};
