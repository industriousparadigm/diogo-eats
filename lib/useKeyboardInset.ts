"use client";

import { useEffect, useState } from "react";

// Returns the number of CSS pixels that the on-screen keyboard is
// covering at the bottom of the layout viewport.
//
// iOS Safari quirk: `position: fixed; bottom: 0` anchors to the
// LAYOUT viewport — which doesn't shrink when the keyboard opens. So
// the bottom of a "sticky" save bar ends up BELOW the keyboard,
// invisible to the user. The VisualViewport API gives us the visible
// area so we can offset accordingly.
//
// Usage:
//   const kbd = useKeyboardInset();
//   <div style={{ position: "fixed", bottom: kbd, ... }}>...</div>
//
// When the keyboard is down: returns 0.
// When it's up: returns its height in CSS pixels.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // layoutHeight - visibleHeight - any scrolling offset. We clamp
      // to 0 — on desktop or rotation, the math can briefly go negative.
      const next = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop)
      );
      setInset(next);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
