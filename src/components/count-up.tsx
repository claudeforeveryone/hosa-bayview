"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { formatCount } from "@/lib/activity";

// Set once the first page load has hydrated. Server-rendered numbers are already on screen by then, so they
// stay put; numbers that mount later (moving between pages in the app) start at zero and count up.
let hydrated = false;

// A number that counts up from zero once, on mount, in about 700 ms (ease-out), when it mounts after the first
// page load. On the first load it just shows the value, so the server's number never flashes back to zero.
// Reduce Motion or calm motion skips the count and shows the value. `kind="percent"` takes a
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
  // Decided once, on mount. `hydrated` is only ever true in the browser, so window is safe to read here.
  const [animate] = useState(
    () =>
      hydrated &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      document.documentElement.dataset.motion !== "calm",
  );
  const [n, setN] = useState(() => (animate ? 0 : target));

  useEffect(() => {
    hydrated = true;
  }, []);

  useLayoutEffect(() => {
    if (!animate || target <= 0) return;
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
  }, [animate, target]);

  // Not counting (first page load, or still motion): always the live value.
  const shown = animate && target > 0 ? n : target;
  if (to === null) return <>—</>;
  if (kind === "percent") return <>{shown}%</>;
  return <>{formatCount(shown)}</>;
}
