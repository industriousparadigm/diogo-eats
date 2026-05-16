"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { textareaStyle } from "@/lib/styles";

// Auto-growing <textarea> shared across the app. Solves the "rows={1}
// + long wrapped content gets clipped" class of bug — instead of a
// fixed row count we read scrollHeight on every value change and grow
// the element to fit. No internal scroll, no clipping. The page (or
// the parent sheet) handles outer scrolling.
//
// Use this for any free-form text field. Single line OR multiple, the
// element adapts. The only style override callers usually need is the
// font-size or padding tweaks for compact rows.
//
// Notes:
//   - Defaults to `textareaStyle` from lib/styles. Caller can spread
//     additional style on top via the `style` prop.
//   - `minRows` controls the resting height when empty (default 1).
//   - `value` is required (uncontrolled growth is unreliable on iOS).

// useLayoutEffect on the client, useEffect on the server — Next.js
// renders this on the server too and useLayoutEffect would warn.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Props = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "rows" | "ref"
> & {
  value: string;
  minRows?: number;
};

export function AutoGrowTextarea({
  value,
  minRows = 1,
  style,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Resize on every value change. We zero the height first so shrinking
  // works (scrollHeight only ever grows otherwise).
  //
  // After resizing, scroll the bottom of the textarea into view if it's
  // focused. Otherwise on iOS the keyboard can cover the caret as the
  // text grows past the visible viewport — invisible-typing is the #1
  // complaint about long-text capture. `block: "nearest"` is a no-op
  // when already on screen, so this is cheap on short inputs too.
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (document.activeElement === el) {
      // Defer to next frame so the new height has flushed before scrolling.
      requestAnimationFrame(() => {
        try {
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
        } catch {
          // Safari can throw if the element was unmounted between RAFs.
        }
      });
    }
  }, [value]);

  // When the user first focuses the textarea (keyboard pop), iOS doesn't
  // always scroll fixed parents to keep the input visible. Force it.
  function onFocusInternal(e: React.FocusEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {}
    });
    rest.onFocus?.(e);
  }

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      {...rest}
      onFocus={onFocusInternal}
      style={{
        ...textareaStyle,
        // Caller styles win over the default. minHeight stays useful as
        // a "don't collapse below this" floor when value is empty.
        ...style,
        // resize: none is non-negotiable — the user can't drag-resize
        // an auto-growing element without confusion.
        resize: "none",
        overflow: "hidden",
        // Generous bottom margin in the scroll-into-view calculation so
        // the caret doesn't sit flush against the bottom edge of the
        // visible viewport (or against the iOS keyboard).
        scrollMarginBottom: 24,
      }}
    />
  );
}
