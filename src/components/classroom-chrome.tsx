"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { RECENT_ROOMS_COOKIE, pushRecentRoom } from "@/lib/classroom-tabs";

// Remembers the rooms you open, newest first, so Events can put them at the top. Per device, a year.
function rememberRoom(id: string) {
  try {
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${RECENT_ROOMS_COOKIE}=`))
      ?.slice(RECENT_ROOMS_COOKIE.length + 1);
    const next = pushRecentRoom(current, id);
    if (next) document.cookie = `${RECENT_ROOMS_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Cookies blocked: Events just falls back to A to Z.
  }
}

// The classroom header and tabs. Hidden while taking or reviewing a test, so the question owns the screen;
// that page has its own way back.
export function ClassroomChrome({ id, children }: { id: string; children: ReactNode }) {
  const path = usePathname();
  useEffect(() => {
    rememberRoom(id);
  }, [id]);
  if (/\/tests\/[^/]+\/a\//.test(path)) return null;
  return <>{children}</>;
}
