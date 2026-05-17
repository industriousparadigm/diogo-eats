"use client";

import { Suspense, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AutoGrowTextarea } from "../components/AutoGrowTextarea";
import { PhotoCropSheet } from "../components/PhotoCropSheet";
import { colors } from "@/lib/styles";
import { parsePhoto, parseText } from "@/lib/api";
import { addPendingTask, removePendingTask, updatePendingTask } from "@/lib/pendingStore";
import type { PendingTask } from "@/lib/types";
import { ymd, todayStart, isSameDay } from "@/lib/date";

// Unified capture page. One screen, one submit, no modal. The user can:
//   - Add 1-4 photos (optional)
//   - Tap a photo to rotate / crop
//   - Type a description (optional too, but at least ONE of photo
//     or text must be present)
//   - Submit → fires the parse in the background, routes home, the
//     pending card appears in the day's list
//
// Replaces ConfirmSheet (photo-confirm modal) and TextSheet (text-only
// modal). The home page's ActionBar collapses to a single "log" pill
// that links here.
export default function LogPage() {
  return (
    <Suspense fallback={null}>
      <LogInner />
    </Suspense>
  );
}

function LogInner() {
  const router = useRouter();
  const params = useSearchParams();
  const forDateParam = params?.get("date");
  // Match home's date semantics: if a valid YYYY-MM-DD and not in the
  // future, log against it; otherwise default to today.
  const forDateYmd = (() => {
    if (forDateParam && /^\d{4}-\d{2}-\d{2}$/.test(forDateParam)) {
      const d = new Date(`${forDateParam}T00:00:00`);
      if (!isNaN(d.getTime()) && d.getTime() <= todayStart().getTime()) {
        return forDateParam;
      }
    }
    return null;
  })();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [cropIdx, setCropIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const previewUrls = files.map((f) => URL.createObjectURL(f));
  // (Object URLs leak technically. revoked on unmount via the home
  // page's PendingTask cleanup; OK for this short-lived screen.)

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, 4);
    if (picked.length === 0) return;
    setError(null);
    setFiles(picked);
  }

  function addMore(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setFiles((arr) => [...arr, ...picked].slice(0, 4));
    e.target.value = "";
  }

  function removeAt(idx: number) {
    setFiles((arr) => arr.filter((_, i) => i !== idx));
  }

  function replaceAt(idx: number, f: File) {
    setFiles((arr) => arr.map((cur, i) => (i === idx ? f : cur)));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const text = caption.trim();
    if (files.length === 0 && !text) {
      setError("add a photo, or describe what you ate");
      return;
    }
    setSubmitting(true);

    const taskId = crypto.randomUUID();
    const kind: PendingTask["kind"] = files.length > 0 ? "photo" : "text";
    const previewUrl =
      files.length > 0 ? URL.createObjectURL(files[0]) : undefined;

    const task: PendingTask = {
      id: taskId,
      kind,
      files: files.length > 0 ? files : undefined,
      text: kind === "text" ? text : undefined,
      caption: kind === "photo" && text ? text : undefined,
      previewUrl,
      photoCount: files.length || undefined,
      status: "processing",
      startedAt: Date.now(),
      forDate: forDateYmd ?? undefined,
    };
    addPendingTask(task);

    // Fire and forget. Home renders the pending card; on success we
    // remove the task and home's silent reload picks up the new meal.
    (async () => {
      try {
        if (kind === "photo") {
          await parsePhoto(files, text || undefined, forDateYmd ?? undefined);
        } else {
          await parseText(text, forDateYmd ?? undefined);
        }
        removePendingTask(taskId);
        // Soft signal to home: bump a query param so its visibility
        // listener triggers a reload.
        try {
          window.dispatchEvent(new CustomEvent("eats:meal-saved"));
        } catch {}
      } catch (err: any) {
        updatePendingTask(taskId, (t) => ({
          ...t,
          status: "error",
          errorMessage: err?.message ?? "something went wrong",
        }));
      }
    })();

    // Route home immediately. The card is already there.
    const dest = forDateYmd ? `/?date=${forDateYmd}` : "/";
    router.push(dest);
  }

  const single = files.length === 1;
  const dayLabel = forDateYmd
    ? new Date(`${forDateYmd}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        maxWidth: 540,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 96px)",
      }}
    >
      <header
        style={{
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <button
          onClick={() => router.back()}
          aria-label="back"
          style={{
            background: "transparent",
            color: colors.textMuted,
            fontSize: 22,
            padding: 6,
            borderRadius: 6,
            border: "none",
          }}
        >
          ‹
        </button>
        <div
          style={{
            flex: 1,
            fontSize: 13,
            color: colors.textMuted,
            letterSpacing: 0.5,
            textAlign: "center",
          }}
        >
          {dayLabel ? `LOG · ${dayLabel.toUpperCase()}` : "LOG A MEAL"}
        </div>
        <div style={{ width: 36 }} />
      </header>

      <form
        onSubmit={submit}
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {files.length === 0 ? (
          <label
            htmlFor="log-photo-input"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              border: `1px dashed ${colors.borderDashed}`,
              borderRadius: 12,
              color: colors.textMuted,
              cursor: "pointer",
              gap: 6,
              background: colors.surfaceAlt,
            }}
          >
            <div style={{ fontSize: 28 }}>📷</div>
            <div style={{ fontSize: 13 }}>add photo (optional)</div>
            <div style={{ fontSize: 11, color: colors.textFaint }}>
              up to 4 — labels welcome
            </div>
          </label>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {single ? (
              <button
                type="button"
                onClick={() => setCropIdx(0)}
                aria-label="crop / rotate / zoom"
                style={{
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  position: "relative",
                  display: "block",
                  width: "100%",
                }}
              >
                <img
                  src={previewUrls[0]}
                  alt="meal preview"
                  style={{
                    width: "100%",
                    maxHeight: 320,
                    objectFit: "cover",
                    borderRadius: 12,
                    display: "block",
                    background: colors.surfaceMuted,
                  }}
                />
                <span style={cropHint}>tap to crop / rotate</span>
              </button>
            ) : (
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
                      background: colors.surfaceMuted,
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
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAt(i)}
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
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                fontSize: 12,
                color: colors.textFaint,
              }}
            >
              <label
                htmlFor="log-photo-more"
                style={{
                  background: "transparent",
                  color: colors.textMuted,
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: 8,
                  padding: "6px 12px",
                  cursor: files.length < 4 ? "pointer" : "default",
                  opacity: files.length < 4 ? 1 : 0.4,
                  fontSize: 12,
                }}
              >
                + add another
              </label>
              <button
                type="button"
                onClick={() => setFiles([])}
                style={{
                  background: "transparent",
                  color: colors.textFaint,
                  border: "none",
                  fontSize: 12,
                  padding: "6px 4px",
                  cursor: "pointer",
                }}
              >
                remove all
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          id="log-photo-input"
          type="file"
          accept="image/*"
          multiple
          onChange={onPickFiles}
          style={{ display: "none" }}
        />
        <input
          id="log-photo-more"
          type="file"
          accept="image/*"
          multiple
          onChange={addMore}
          style={{ display: "none" }}
          disabled={files.length >= 4}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 11,
              color: colors.textSubtle,
              letterSpacing: 0.5,
            }}
          >
            {files.length > 0
              ? "DESCRIBE (OPTIONAL)"
              : "DESCRIBE WHAT YOU ATE"}
          </label>
          <AutoGrowTextarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={
              files.length > 0
                ? "e.g. at restaurant, small plate, low-sugar"
                : "e.g. two slices of peanut butter cake / a small bowl of oats with banana"
            }
            maxLength={1000}
            minRows={files.length > 0 ? 2 : 4}
            style={{
              padding: "12px 14px",
              fontSize: 16,
              lineHeight: 1.4,
              minHeight: files.length > 0 ? 60 : 120,
            }}
          />
          {files.length > 0 && (
            <div style={{ fontSize: 11, color: colors.textFaint, lineHeight: 1.4 }}>
              Captions get taken seriously — mention size hints, "at restaurant",
              or anything Vision wouldn't see from the photo alone.
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              background: "#7f1d1d",
              padding: 10,
              borderRadius: 8,
              fontSize: 13,
              color: "#fee2e2",
            }}
          >
            {error}
          </div>
        )}
      </form>

      {cropIdx != null && files[cropIdx] && (
        <PhotoCropSheet
          file={files[cropIdx]}
          onApply={(cropped) => {
            replaceAt(cropIdx, cropped);
            setCropIdx(null);
          }}
          onCancel={() => setCropIdx(null)}
        />
      )}

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: colors.bg,
          borderTop: `1px solid ${colors.border}`,
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
          display: "flex",
          gap: 8,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          style={{
            background: "transparent",
            color: colors.textMuted,
            padding: "12px 16px",
            fontSize: 14,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 8,
          }}
        >
          cancel
        </button>
        <button
          type="button"
          onClick={submit as unknown as () => void}
          disabled={
            submitting || (files.length === 0 && !caption.trim())
          }
          style={{
            flex: 1,
            background:
              submitting || (files.length === 0 && !caption.trim())
                ? "#3f3f46"
                : colors.accent,
            color: "#fff",
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 8,
            border: "none",
            cursor:
              submitting || (files.length === 0 && !caption.trim())
                ? "default"
                : "pointer",
          }}
        >
          {submitting
            ? "logging…"
            : forDateYmd
              ? `log for ${dayLabel}`
              : "log it"}
        </button>
      </div>
    </main>
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
