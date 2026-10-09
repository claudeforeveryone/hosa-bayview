"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Shared by every bell on the page, so the sidebar and the phone bar always agree.
const listeners = new Set<(n: number) => void>();
let current: number | null = null;

function publish(n: number) {
  current = n;
  for (const l of listeners) l(n);
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
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await createClient().rpc("unread_notifications");
      if (alive && !error && typeof data === "number") publish(data);
    };
    check();
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("hosa:notifications", check);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("hosa:notifications", check);
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
          className="bell-badge num absolute top-0.5 right-0 grid h-5 min-w-5 place-items-center bg-you px-1 font-display text-[13px] leading-none font-bold text-on-you"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
