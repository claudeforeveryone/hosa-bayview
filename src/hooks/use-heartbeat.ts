"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Once a minute, while the tab is visible and there was input in the last two minutes.
// The database keeps one row per minute, so a repeat in the same minute changes nothing.
export const HEARTBEAT_MS = 60_000;
export const IDLE_MS = 2 * 60_000;
const INPUT_EVENTS = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart"] as const;

export function useHeartbeat(classroomId: string | null) {
  const room = useRef(classroomId);

  useEffect(() => {
    room.current = classroomId;
  }, [classroomId]);

  useEffect(() => {
    let lastInput = Date.now();
    const bump = () => {
      lastInput = Date.now();
    };
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInput > IDLE_MS) return;
      try {
        await createClient().rpc("heartbeat", { cid: room.current });
      } catch {
        // Presence is a convenience; a missed beat just means a minute uncounted.
      }
    };

    for (const event of INPUT_EVENTS) window.addEventListener(event, bump, { passive: true });
    document.addEventListener("visibilitychange", beat);
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    beat();

    return () => {
      for (const event of INPUT_EVENTS) window.removeEventListener(event, bump);
      document.removeEventListener("visibilitychange", beat);
      window.clearInterval(timer);
    };
  }, []);
}
