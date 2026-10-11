"use client";

import { useState, useTransition } from "react";
import { Mail, MailOpen } from "lucide-react";
import { markAnnouncementRead } from "@/app/(app)/announcements/actions";

// Mark as read / Mark as unread. Reading an announcement never marks it by itself.
export function AnnouncementReadToggle({ id, read }: { id: string; read: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const Icon = read ? Mail : MailOpen;
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await markAnnouncementRead(id, !read);
            setError(result.error ?? null);
          })
        }
        className={`caps step press inline-flex h-12 items-center gap-2 px-5 text-16 disabled:opacity-60 ${
          read ? "border-2 border-ink hover:bg-band" : "bg-ink text-ground hover:bg-ink-2"
        }`}
      >
        <Icon size={20} strokeWidth={2} aria-hidden />
        {pending ? "Saving" : read ? "Mark as unread" : "Mark as read"}
      </button>
      {error ? (
        <p role="alert" className="text-15 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
