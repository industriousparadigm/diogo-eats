"use client";

import { useEffect } from "react";

// Lock the document body's scroll while the hook is mounted. Used by
// modal sheets so iOS doesn't scroll the underlying page when the user
// drags inside the sheet — the original behaviour was that the background
// scrolled first, then the sheet, which was disorienting.
//
// Restores the previous overflow value on unmount so multiple stacked
// sheets compose cleanly (LIFO unmount order).
export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const original = document.body.style.overflow;
    const originalTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = original;
      document.body.style.touchAction = originalTouch;
    };
  }, [active]);
}
