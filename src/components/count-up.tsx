"use client";

import { useLayoutEffect, useState } from "react";
import { formatCount } from "@/lib/activity";

// A number that counts up from zero once, on mount, in about 700 ms (ease-out). The server render and the first
// client render both show the final value, and the reset to zero happens in a layout effect, before paint, so
// nothing flashes. Reduce Motion or calm motion skips the count and shows the value. `kind="percent"` takes a
// fraction (0 to 1, as the stats give it) and shows whole percent; null shows a dash.
export function CountUp({
  to,
  kind = "count",
}: {
  to: number | null;
  kind?: "count" | "percent";
}) {
  const target =
    to === null ? 0 : Math.round(kind === "percent" ? to * 100 : to);
  const [n, setN] = useState(target);

  useLayoutEffect(() => {
    if (target <= 0) return;
    const still =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motion === "calm";
    if (still) return;
    const DURATION = 700;
    let frame = 0;
    let start = 0;
    // The first frame runs at p = 0, so the count starts from zero before the next paint.
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / DURATION);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (to === null) return <>—</>;
  if (kind === "percent") return <>{n}%</>;
  return <>{formatCount(n)}</>;
}
