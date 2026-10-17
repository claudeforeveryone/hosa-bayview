import Link from "next/link";
import { Pin } from "lucide-react";
import type { AnnouncementRow, AnnouncementState } from "@/lib/announcements";
import { formatWhen, timeAgo } from "@/lib/when";

// The announcements as an inbox: one line per announcement, its headline as the subject, and its channel (the
// chapter or an event room) as a tag when the list mixes channels. Unread ones
// are bold on the highlight colour with a "New" tag; read ones sit on the quiet band in ink-2. Opening one
// shows the whole thing; marking it read or deleting it from your list happens there.
export function AnnouncementInbox({
  rows,
  states,
  now,
}: {
  rows: (AnnouncementRow & { channel?: string })[];
  states: Map<string, AnnouncementState>;
  now: number;
}) {
  return (
    <ul className="border-[3px] border-ink">
      {rows.map((a) => {
        const read = states.get(a.id)?.read ?? false;
        return (
          <li key={a.id} className="border-t border-rule first:border-t-0">
            <Link
              href={`/announcements/${a.id}`}
              className={`step grid grid-cols-[6px_minmax(0,1fr)_auto] items-stretch gap-x-3 sm:gap-x-4 ${
                read ? "bg-band text-ink-2 hover:text-ink" : "bg-ground text-ink hover:bg-band"
              }`}
            >
              <span aria-hidden className={read ? "bg-transparent" : "bg-you"} />
              <span className="grid min-w-0 gap-1 py-3.5">
                <span className="flex min-w-0 items-center gap-2">
                  {read ? null : (
                    <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-12 leading-none text-on-you">New</span>
                  )}
                  {a.channel ? (
                    <span className="caps max-w-[40%] shrink-0 truncate border border-rule-strong px-1.5 py-0.5 text-12 leading-none text-ink-2">
                      {a.channel}
                    </span>
                  ) : null}
                  {a.pinned ? (
                    <Pin size={14} strokeWidth={2.25} aria-label="Pinned" role="img" className="shrink-0" />
                  ) : null}
                  <span
                    className={`truncate text-18 leading-snug ${read ? "font-normal" : "font-bold"}`}
                  >
                    {a.title}
                  </span>
                </span>
                <span className="truncate text-15 text-ink-2">
                  {a.author?.full_name ? `${a.author.full_name} — ` : ""}
                  {a.body || "No message, just the headline."}
                </span>
              </span>
              <time
                dateTime={a.created_at}
                title={formatWhen(a.created_at)}
                className={`num caps self-start pt-4 pr-3 text-13 whitespace-nowrap sm:pr-4 ${read ? "" : "font-semibold"}`}
              >
                {timeAgo(a.created_at, now)}
              </time>
              <span className="sr-only">{read ? "Read" : "Unread"}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
