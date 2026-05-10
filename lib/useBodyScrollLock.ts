"use client";

import { useEffect } from "react";

// Lock the document body's scroll while the hook is mounted.
//
// iOS Safari is a special case: setting body.overflow = "hidden" alone
// is NOT enough — the page still rubber-band scrolls behind the modal,
// which leaks the background content into view. The reliable fix is to
// position:fix the body at -scrollY, restoring on unmount. This pattern
// is what every production-grade modal lib (react-modal, headlessui, etc)
// settles on for iOS.
//
// Multiple stacked sheets compose cleanly because we capture & restore
// the previous body styles on each mount/unmount (LIFO).
export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      touchAction: body.style.touchAction,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.touchAction = "none";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.touchAction = prev.touchAction;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
