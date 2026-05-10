"use client";

import { useEffect, useMemo } from "react";
import { textareaStyle } from "@/lib/styles";
import { PrimaryButton, SecondaryButton, SheetShell } from "./sheet";

// Modal sheet shown after the user picks one or more photos. They can
// review the previews, optionally tweak caption, and either confirm or
// cancel. Multi-photo state is supported here even though the server
// stitches them — the user sees them as separate thumbnails for clarity.
export function ConfirmSheet({
  files,
  onRemoveAt,
  caption,
  setCaption,
  busy,
  onCancel,
  onSubmit,
}: {
  files: File[];
  onRemoveAt: (idx: number) => void;
  caption: string;
  setCaption: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  // Object URLs for previews; revoked on unmount or file-list change.
  const previewUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previewUrls.forEach(URL.revokeObjectURL), [previewUrls]);

  const single = files.length === 1;

  return (
    <SheetShell onScrimClick={busy ? undefined : onCancel}>
      {single ? (
        <img
          src={previewUrls[0]}
          alt="meal preview"
          style={{
            width: "100%",
            maxHeight: 280,
            objectFit: "cover",
            borderRadius: 12,
            background: "#18181b",
          }}
        />
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 4,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {previewUrls.map((url, i) => (
              <div
                key={i}
                style={{
                  position: "relative",
                  flexShrink: 0,
                  width: 120,
                  height: 160,
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#18181b",
                }}
              >
                <img
                  src={url}
                  alt={`photo ${i + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  onClick={() => onRemoveAt(i)}
                  disabled={busy}
                  aria-label={`remove photo ${i + 1}`}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.65)",
                    color: "#fff",
                    fontSize: 14,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#71717a", lineHeight: 1.4 }}>
            {files.length} photos will be combined into one image — same Vision
            cost as a single photo. Add nutrition labels here for accuracy.
          </div>
        </>
      )}
      <textarea
        autoFocus
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder={
          single
            ? "describe (optional) — e.g. at restaurant, small plate, low-sugar"
            : "describe (optional) — e.g. toast with guac + cottage cheese (labels included)"
        }
        maxLength={500}
        disabled={busy}
        rows={2}
        style={textareaStyle}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <SecondaryButton onClick={onCancel} disabled={busy}>
          cancel
        </SecondaryButton>
        <PrimaryButton onClick={onSubmit} disabled={busy} flex>
          {busy ? "reading the plate…" : "log it"}
        </PrimaryButton>
      </div>
    </SheetShell>
  );
}
