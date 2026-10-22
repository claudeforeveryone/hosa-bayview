"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { readNotifySound } from "@/lib/appearance";
import { feedback } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/client";

// Shared by every bell on the page, so the sidebar and the phone bar always agree.
const listeners = new Set<(n: number) => void>();
let current: number | null = null;
// When the count was last asked for. The layout's server count counts as the first ask, so a page load doesn't
// ask again, and quick taps between pages share one ask instead of one each.
let lastAsked = Date.now();
const MIN_GAP_MS = 30_000;

// A chime when the count goes up between polls. The first poll only sets the baseline, so a page load
// never chimes, and both bells share `current`, so one rise chimes once.
function publish(n: number) {
  const rose = current !== null && n > current;
  current = n;
  for (const l of listeners) l(n);
  if (rose && readNotifySound() === "on") feedback("notify");
}

// The layout's count is a starting point; layouts don't re-render on navigation, so the bell re-checks on
// route changes, when the tab comes back, and once a minute while it's visible.
function useUnread(initial: number) {
  const [count, setCount] = useState(current ?? initial);
  const path = usePathname();

  useEffect(() => {
    listeners.add(setCount);
    return () => {
      listeners.delete(setCount);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const ask = async () => {
      if (document.visibilityState !== "visible") return;
      lastAsked = Date.now();
      const { data, error } = await createClient().rpc("unread_notifications");
      if (alive && !error && typeof data === "number") publish(data);
    };
    const check = () => {
      if (Date.now() - lastAsked >= MIN_GAP_MS) void ask();
    };
    // Opening or clearing notifications always re-asks.
    const now = () => void ask();
    check();
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("hosa:notifications", now);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("hosa:notifications", now);
    };
  }, [path]);

  return count;
}

export function NotificationBell({
  initial,
  className = "",
}: {
  initial: number;
  className?: string;
}) {
  const count = useUnread(initial);
  const path = usePathname();
  const active = path.startsWith("/notifications");
  const label = count ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`step relative grid size-11 place-items-center ${className}`}
    >
      <Bell
        size={24}
        strokeWidth={1.75}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.25 : 0}
        aria-hidden
      />
      {count ? (
        <span
          aria-hidden
          className="bell-badge num absolute top-0 -right-0.5 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-you px-1.5 font-display text-13 leading-none font-bold text-on-you"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
