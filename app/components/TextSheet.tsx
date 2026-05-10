"use client";

import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { PrimaryButton, SecondaryButton, SheetShell } from "./sheet";

// Modal sheet for text-only meal logging. Used when the user wants to
// describe a meal without a photo (e.g. retroactive logs, café snacks
// without a label).
export function TextSheet({
  value,
  setValue,
  busy,
  onCancel,
  onSubmit,
}: {
  value: string;
  setValue: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <SheetShell onScrimClick={busy ? undefined : onCancel}>
      <div style={{ fontSize: 12, color: "#71717a", letterSpacing: 0.5 }}>
        TYPE WHAT YOU ATE
      </div>
      <AutoGrowTextarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. two slices of peanut butter cake / a small bowl of oats with banana / takeout pasta with cream sauce"
        maxLength={1000}
        disabled={busy}
        minRows={5}
        style={{
          padding: "12px 14px",
          fontSize: 16,
          lineHeight: 1.4,
          minHeight: 120,
        }}
      />
      <div style={{ fontSize: 11, color: "#52525b" }}>
        Mention size if it matters (e.g. “two slices”, “a small bowl”). Add “at
        restaurant” if eating out.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <SecondaryButton onClick={onCancel} disabled={busy}>
          cancel
        </SecondaryButton>
        <PrimaryButton onClick={onSubmit} disabled={busy || !value.trim()} flex>
          {busy ? "thinking…" : "log it"}
        </PrimaryButton>
      </div>
    </SheetShell>
  );
}
