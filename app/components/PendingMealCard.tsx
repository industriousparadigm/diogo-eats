"use client";

import type { PendingTask } from "@/lib/types";
import { colors } from "@/lib/styles";
import { Block } from "./Skeleton";

// Placeholder for an in-flight meal. Same outer shape as MealCard so
// when the real card swaps in, nothing jumps. While processing: photo
// thumb (if any) on the left, "reading the plate…" + shimmering metric
// rows on the right. On error: red border, message, try-again + dismiss.
//
// Pending cards never affect totals or the pulse — only real DB rows
// count there. The card itself is the visible "more is coming" signal.
export function PendingMealCard({
  task,
  onRetry,
  onDismiss,
}: {
  task: PendingTask;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const isError = task.status === "error";
  const hasPhoto = task.kind === "photo" && task.previewUrl;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={isError ? "log failed" : "logging meal"}
      className="fade-in"
      style={{
        background: colors.surface,
        border: isError
          ? "1px solid rgba(220, 38, 38, 0.45)"
          : `1px solid ${colors.border}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        gap: 0,
      }}
    >
      {hasPhoto ? (
        <div
          style={{
            position: "relative",
            width: 120,
            height: 120,
            flexShrink: 0,
            background: colors.surfaceMuted,
          }}
        >
          <img
            src={task.previewUrl}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: isError ? 0.5 : 0.85,
            }}
          />
          {!isError && (
            <div
              aria-hidden
              className="skeleton"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 0,
                mixBlendMode: "overlay",
                opacity: 0.7,
              }}
            />
          )}
          {task.photoCount && task.photoCount > 1 && (
            <div
              style={{
                position: "absolute",
                bottom: 6,
                right: 6,
                fontSize: 10,
                color: "#f4f4f5",
                background: "rgba(0,0,0,0.65)",
                padding: "2px 6px",
                borderRadius: 999,
                letterSpacing: 0.3,
              }}
            >
              +{task.photoCount - 1}
            </div>
          )}
        </div>
      ) : (
        <div
          aria-hidden
          style={{
            width: 4,
            background: isError
              ? "linear-gradient(180deg, #7f1d1d, #18181b)"
              : "linear-gradient(180deg, #65a30d, #18181b)",
            flexShrink: 0,
          }}
        />
      )}

      <div
        style={{
          flex: 1,
          padding: hasPhoto ? "12px 14px 12px 14px" : "12px 14px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: isError ? "#fca5a5" : colors.textMuted,
            letterSpacing: 0.2,
          }}
        >
          {isError
            ? "log failed"
            : task.kind === "photo"
              ? "reading the plate…"
              : "thinking…"}
        </div>

        {isError ? (
          <>
            {task.errorMessage && (
              <div
                style={{
                  fontSize: 12,
                  color: colors.textSubtle,
                  lineHeight: 1.4,
                }}
              >
                {task.errorMessage}
              </div>
            )}
            {(task.caption || task.text) && (
              <div
                style={{
                  fontSize: 12,
                  color: colors.textSubtle,
                  fontStyle: "italic",
                  lineHeight: 1.4,
                  // Don't let runaway text squash the action row.
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                “{task.caption || task.text}”
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <button
                onClick={onRetry}
                style={errorBtnPrimary}
                aria-label="try again"
              >
                try again
              </button>
              <button
                onClick={onDismiss}
                style={errorBtnSecondary}
                aria-label="dismiss"
              >
                dismiss
              </button>
            </div>
          </>
        ) : (
          <>
            {(task.caption || task.text) && (
              <div
                style={{
                  fontSize: 12,
                  color: colors.textSubtle,
                  fontStyle: "italic",
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                “{task.caption || task.text}”
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Block height={10} width="80%" radius="pill" />
              <Block height={10} width="55%" radius="pill" />
            </div>
            <Block height={10} width="90%" radius="pill" />
          </>
        )}
      </div>
    </div>
  );
}

const errorBtnPrimary: React.CSSProperties = {
  background: "rgba(220, 38, 38, 0.18)",
  border: "1px solid rgba(220, 38, 38, 0.45)",
  color: "#fca5a5",
  padding: "5px 12px",
  borderRadius: 999,
  fontSize: 12,
  letterSpacing: 0.2,
  cursor: "pointer",
};

const errorBtnSecondary: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${colors.borderStrong}`,
  color: colors.textSubtle,
  padding: "5px 12px",
  borderRadius: 999,
  fontSize: 12,
  letterSpacing: 0.2,
  cursor: "pointer",
};
