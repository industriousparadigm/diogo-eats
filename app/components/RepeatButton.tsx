"use client";

import { useState } from "react";
import { colors } from "@/lib/styles";

// The deterministic "log again" affordance. Tapping it reveals a small
// inline scale picker (½ · 1× · 2×); picking one re-logs the source meal
// verbatim at that scale for today, no Vision call. Lives on the meal
// card and the meal detail surface — both pass an `onRepeat(scale)` that
// hits POST /api/meals/[id]/repeat.
//
// Design: same restraint as the rest of the app. Faint chip in resting
// state, lime accent only on the active picker. Real red is reserved for
// genuine errors, so a failure shows the bad-but-not-alarm `bad` tone.
export function RepeatButton({
  onRepeat,
  variant = "card",
}: {
  onRepeat: (scale: number) => Promise<void>;
  variant?: "card" | "detail";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function pick(scale: number) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await onRepeat(scale);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        data-stop-card-click
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="log this meal again"
        title="log again"
        style={{
          background: "transparent",
          color: error ? colors.bad : colors.textSubtle,
          border: `1px solid ${colors.border}`,
          borderRadius: 999,
          padding: variant === "detail" ? "6px 12px" : "3px 9px",
          fontSize: variant === "detail" ? 12 : 11,
          letterSpacing: 0.3,
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          whiteSpace: "nowrap",
        }}
      >
        {error ? "try again" : "↻ again"}
      </button>
    );
  }

  return (
    <div
      data-stop-card-click
      onClick={(e) => e.stopPropagation()}
      style={{ display: "flex", alignItems: "center", gap: 6 }}
    >
      {([
        ["½", 0.5],
        ["1×", 1],
        ["2×", 2],
      ] as const).map(([label, scale]) => (
        <button
          key={label}
          data-stop-card-click
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            pick(scale);
          }}
          disabled={busy}
          aria-label={`log again at ${label}`}
          style={{
            background: scale === 1 ? "rgba(132,204,22,0.12)" : "transparent",
            color: scale === 1 ? colors.accentLight : colors.textMuted,
            border: `1px solid ${scale === 1 ? "rgba(132,204,22,0.30)" : colors.borderStrong}`,
            borderRadius: 999,
            padding: variant === "detail" ? "6px 12px" : "3px 9px",
            fontSize: variant === "detail" ? 12 : 11,
            fontWeight: 500,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {label}
        </button>
      ))}
      <button
        data-stop-card-click
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
          setError(false);
        }}
        disabled={busy}
        aria-label="cancel"
        style={{
          background: "transparent",
          color: colors.textFaint,
          border: "none",
          padding: "3px 6px",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
