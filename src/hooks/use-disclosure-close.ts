"use client";

import { useEffect, type RefObject } from "react";

// Closes a native <details> menu on an outside tap, focus moving elsewhere, or Escape (which hands focus
// back to the summary when it was inside).
export function useDisclosureClose(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        const inside = el.contains(document.activeElement);
        el.open = false;
        if (inside) el.querySelector("summary")?.focus();
      } else if (!el.contains(e.target as Node)) {
        // A tap elsewhere, or focus tabbing past the last item.
        el.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("focusin", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("focusin", close);
      document.removeEventListener("keydown", close);
    };
  }, [ref]);
}
