"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { clicksToReport } from "@/lib/clicks";

// Every 30 seconds while the tab is visible and there was input in the last two minutes. The database keeps
// one row per minute, so the extra beats inside a minute change nothing. A room change beats at once.
// Clicks are counted in memory and sent right after the beat as their own call (record_clicks), so an old
// database without that function still gets its presence beats.
export const HEARTBEAT_MS = 30_000;
export const IDLE_MS = 2 * 60_000;
const INPUT_EVENTS = [
  "pointerdown",
  "keydown",
  "mousemove",
  "scroll",
  "touchstart",
] as const;

export function useHeartbeat(classroomId: string | null) {
  const room = useRef(classroomId);
  const beatNow = useRef<() => void>(() => {});

  // Declared first, so on mount it runs before the listener effect sets beatNow (that one beats on mount anyway).
  useEffect(() => {
    room.current = classroomId;
    beatNow.current();
  }, [classroomId]);

  useEffect(() => {
    let lastInput = Date.now();
    let clicks = 0;
    const bump = () => {
      lastInput = Date.now();
    };
    const countClick = () => {
      clicks += 1;
    };
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInput > IDLE_MS) return;
      const client = createClient();
      const toSend = clicksToReport(clicks);
      clicks = 0;
      try {
        await client.rpc("heartbeat", { cid: room.current });
      } catch {
        // Presence is a convenience; a missed beat just means a minute uncounted.
      }
      if (toSend > 0) {
        try {
          await client.rpc("record_clicks", { n: toSend });
        } catch {
          // Missing on an older database, or a dropped request: this flush's clicks are not counted.
        }
      }
    };
    beatNow.current = () => {
      void beat();
    };

    for (const event of INPUT_EVENTS)
      window.addEventListener(event, bump, { passive: true });
    document.addEventListener("click", countClick, {
      capture: true,
      passive: true,
    });
    document.addEventListener("visibilitychange", beat);
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    beat();

    return () => {
      for (const event of INPUT_EVENTS) window.removeEventListener(event, bump);
      document.removeEventListener("click", countClick, { capture: true });
      document.removeEventListener("visibilitychange", beat);
      window.clearInterval(timer);
      beatNow.current = () => {};
    };
  }, []);
}
