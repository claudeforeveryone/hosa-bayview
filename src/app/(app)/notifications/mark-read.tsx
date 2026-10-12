"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Trash2 } from "lucide-react";
import { clearRead, deleteNotification, markAllRead, markRead } from "./actions";

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

// The bin on each notification. One tap takes it out of your inbox (no undo needed for a notice: the thing it
// pointed at is still there). The row fades while it goes.
export function DeleteNotification({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={error ? `Couldn't delete "${title}". Try again` : `Delete "${title}"`}
      title={error ? "Couldn't delete. Try again" : "Delete"}
      onClick={(e) => {
        const row = e.currentTarget.closest("li");
        start(async () => {
          const result = await deleteNotification(id);
          setError(Boolean(result.error));
          if (result.error) return;
          // Focus moves to the next row's bin (or the page title) so keyboard users aren't dropped at the top.
          const next = row?.nextElementSibling ?? row?.previousElementSibling;
          (next?.querySelector("button[data-bin]") as HTMLButtonElement | null)?.focus();
          tellBell();
          router.refresh();
        });
      }}
      data-bin
      className={`step grid size-12 shrink-0 place-items-center self-center hover:bg-band hover:text-danger disabled:opacity-50 ${
        error ? "text-danger" : "text-ink-2"
      }`}
    >
      <Trash2 size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

// "Clear read": deletes every notification you've already read. Two taps, since it takes a lot at once.
export function ClearRead({ count }: { count: number }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const base =
    "caps step press inline-flex h-12 items-center gap-2 border-2 px-5 text-16 disabled:opacity-60";
  return (
    <div className="grid justify-items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!armed) return setArmed(true);
            start(async () => {
              const result = await clearRead();
              setError(result.error ?? null);
              setArmed(false);
              if (!result.error) router.refresh();
            });
          }}
          className={`${base} ${armed ? "border-danger bg-danger text-ground" : "border-ink hover:bg-band"}`}
        >
          <Trash2 size={20} strokeWidth={2} aria-hidden />
          {pending ? "Deleting" : armed ? `Delete ${count} read` : "Clear read"}
        </button>
        {armed && !pending ? (
          <button
            type="button"
            onClick={() => setArmed(false)}
            className={`${base} border-ink hover:bg-band`}
          >
            Keep them
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-15 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
