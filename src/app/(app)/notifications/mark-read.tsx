"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAllRead, markRead } from "./actions";

const tellBell = () => window.dispatchEvent(new Event("hosa:notifications"));

// "Mark all as read": the bell clears and the list moves everything under Earlier.
export function MarkAllRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid justify-items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await markAllRead();
            setError(result.error ?? null);
            if (!result.error) {
              tellBell();
              router.refresh();
            }
          })
        }
        className="caps step press inline-flex h-12 items-center gap-2 border-2 border-ink px-5 text-16 hover:bg-band disabled:opacity-60"
      >
        <CheckCheck size={20} strokeWidth={2} aria-hidden />
        {pending ? "Marking" : "Mark all as read"}
      </button>
      {error ? (
        <p role="alert" className="text-15 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// A notification's link. Opening an unread one marks just that one read; the page it opens doesn't wait for it.
export function NotificationLink({
  id,
  fresh,
  href,
  className,
  children,
}: {
  id: string;
  fresh: boolean;
  href: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (fresh) void markRead([id]).then((r) => (r.error ? undefined : tellBell()));
      }}
    >
      {children}
    </Link>
  );
}
