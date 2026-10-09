"use client";

import { useEffect } from "react";
import { markAllRead } from "./actions";

// Opening the page reads everything. The list keeps its "new" marks for this visit; the bell clears now.
export function MarkRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (!unread) return;
    markAllRead().then(() =>
      window.dispatchEvent(new Event("hosa:notifications")),
    );
  }, [unread]);
  return null;
}
