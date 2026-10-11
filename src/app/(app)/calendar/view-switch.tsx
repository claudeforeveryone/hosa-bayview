"use client";

import Link from "next/link";
import { CALENDAR_VIEW_COOKIE, type CalendarView } from "@/lib/calendar-grid";

// Month | List. The choice is remembered on this device (a cookie, so the server renders the right view
// on the next visit without a flash).
function remember(view: CalendarView) {
  try {
    document.cookie = `${CALENDAR_VIEW_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Cookies blocked: the switch still works through the URL.
  }
}

export function ViewSwitch({ view }: { view: CalendarView }) {
  const tab = (on: boolean) =>
    `caps step flex h-11 min-w-24 items-center justify-center px-4 text-16 ${
      on ? "bg-ink text-ground" : "text-ink-2 hover:bg-band hover:text-ink"
    }`;
  return (
    <nav aria-label="Calendar view" className="flex w-max border-2 border-ink">
      <Link
        href="/calendar?view=month"
        aria-current={view === "month" ? "page" : undefined}
        onClick={() => remember("month")}
        className={tab(view === "month")}
      >
        Month
      </Link>
      <Link
        href="/calendar?view=list"
        aria-current={view === "list" ? "page" : undefined}
        onClick={() => remember("list")}
        className={`${tab(view === "list")} border-l-2 border-ink`}
      >
        List
      </Link>
    </nav>
  );
}
