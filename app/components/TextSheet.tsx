"use client";

import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { PrimaryButton, SecondaryButton, SheetShell } from "./sheet";

// Modal sheet for text-only meal logging. Used when the user wants to
// describe a meal without a photo (e.g. retroactive logs, café snacks
// without a label).
//
// Submit closes the sheet immediately — the parse runs in the background
// and a pending card appears in the meal list.
export function TextSheet({
  value,
  setValue,
  onCancel,
  onSubmit,
}: {
  value: string;
  setValue: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <SheetShell onScrimClick={onCancel}>
      <div style={{ fontSize: 12, color: "#71717a", letterSpacing: 0.5 }}>
        TYPE WHAT YOU ATE
      </div>
      <AutoGrowTextarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. two slices of peanut butter cake / a small bowl of oats with banana / takeout pasta with cream sauce"
        maxLength={1000}
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
        <SecondaryButton onClick={onCancel}>cancel</SecondaryButton>
        <PrimaryButton onClick={onSubmit} disabled={!value.trim()} flex>
          log it
        </PrimaryButton>
      </div>
    </SheetShell>
  );
}
