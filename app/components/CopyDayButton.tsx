"use client";

import { useState } from "react";
import { colors } from "@/lib/styles";
import { formatDayReport } from "@/lib/dayReport";
import type { Meal } from "@/lib/types";

// Small "copy day" affordance lives in the TODAY/YESTERDAY section
// header. One tap → puts a markdown summary of the day on the clipboard,
// ready to paste into Claude/ChatGPT/Obsidian/etc. Brief visual confirm.
//
// We do the formatting client-side from data already in memory so there's
// no extra request — and unit tests cover the formatter in dayReport.test.
export function CopyDayButton({
  meals,
  date,
}: {
  meals: Meal[];
  date: Date;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function onCopy() {
    const text = formatDayReport(meals, date);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback: temporary textarea + execCommand. Older iOS Safari
        // sometimes refuses clipboard.writeText outside a user gesture
        // chain, but here we ARE in one — still defence in depth.
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  }

  const label =
    state === "copied" ? "copied ✓" : state === "failed" ? "failed" : "copy";

  return (
    <button
      onClick={onCopy}
      aria-label="copy day report"
      style={{
        background: "transparent",
        color:
          state === "copied"
            ? colors.accentBright
            : state === "failed"
              ? colors.bad
              : colors.textMuted,
        border: `1px solid ${state === "copied" ? colors.accent : colors.borderStrong}`,
        borderRadius: 999,
        padding: "3px 9px",
        fontSize: 10,
        letterSpacing: 0.5,
        fontWeight: 500,
        textTransform: "uppercase",
        WebkitTapHighlightColor: "transparent",
        cursor: "pointer",
        transition: "color 120ms ease, border-color 120ms ease",
      }}
    >
      {label}
    </button>
  );
}
