"use client";

import { useEffect, useMemo, useState } from "react";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { PhotoCropSheet } from "./PhotoCropSheet";
import { PrimaryButton, SecondaryButton, SheetShell } from "./sheet";

// Modal sheet shown after the user picks one or more photos. They can
// review the previews, optionally tweak caption, and either confirm or
// cancel. Multi-photo state is supported here even though the server
// stitches them — the user sees them as separate thumbnails for clarity.
//
// Tapping a thumbnail (single or multi) opens PhotoCropSheet so the user
// can rotate sideways photos, zoom in, or trim out distracting background
// before the Vision call.
//
// Submit closes the sheet immediately — the parse runs in the background
// and a pending card appears in the meal list. No "thinking…" state here
// any more; the visible work moves to the list.
export function ConfirmSheet({
  files,
  onReplaceAt,
  onRemoveAt,
  caption,
  setCaption,
  onCancel,
  onSubmit,
}: {
  files: File[];
  onReplaceAt: (idx: number, file: File) => void;
  onRemoveAt: (idx: number) => void;
  caption: string;
  setCaption: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const previewUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previewUrls.forEach(URL.revokeObjectURL), [previewUrls]);
  const [cropIdx, setCropIdx] = useState<number | null>(null);

  const single = files.length === 1;

  return (
    <>
      <SheetShell onScrimClick={onCancel}>
        {single ? (
          <button
            type="button"
            onClick={() => setCropIdx(0)}
            aria-label="crop, rotate, or zoom photo"
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "block",
              width: "100%",
              position: "relative",
            }}
          >
            <img
              src={previewUrls[0]}
              alt="meal preview"
              style={{
                width: "100%",
                maxHeight: 280,
                objectFit: "cover",
                borderRadius: 12,
                background: "#18181b",
                display: "block",
              }}
            />
            <span style={cropHint}>tap to crop / rotate</span>
          </button>
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
                  <button
                    type="button"
                    onClick={() => setCropIdx(i)}
                    aria-label={`crop photo ${i + 1}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <img
                      src={url}
                      alt={`photo ${i + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </button>
                  <button
                    onClick={() => onRemoveAt(i)}
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
              cost as a single photo. Add nutrition labels here for accuracy. Tap
              any photo to rotate or crop.
            </div>
          </>
        )}
        <AutoGrowTextarea
          autoFocus
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={
            single
              ? "describe (optional) — e.g. at restaurant, small plate, low-sugar"
              : "describe (optional) — e.g. toast with guac + cottage cheese (labels included)"
          }
          maxLength={500}
          minRows={2}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <SecondaryButton onClick={onCancel}>cancel</SecondaryButton>
          <PrimaryButton onClick={onSubmit} flex>
            log it
          </PrimaryButton>
        </div>
      </SheetShell>

      {cropIdx != null && files[cropIdx] && (
        <PhotoCropSheet
          file={files[cropIdx]}
          onApply={(cropped) => {
            onReplaceAt(cropIdx, cropped);
            setCropIdx(null);
          }}
          onCancel={() => setCropIdx(null)}
        />
      )}
    </>
  );
}

const cropHint: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  right: 8,
  background: "rgba(0,0,0,0.6)",
  color: "#fff",
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  letterSpacing: 0.3,
  pointerEvents: "none",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};
