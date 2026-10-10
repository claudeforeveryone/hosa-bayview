"use client";

import { useEffect } from "react";

// Opens the folded section a #fragment points at, so a hub row lands on its section already open.
export function OpenFromHash() {
  useEffect(() => {
    const open = () => {
      const raw = window.location.hash.slice(1);
      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {
        // A malformed escape: use it as written, which matches nothing.
      }
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) el.open = true;
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
