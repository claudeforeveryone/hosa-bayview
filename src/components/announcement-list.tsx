import { Pin } from "lucide-react";
import { AnnouncementForm } from "@/components/announcement-form";
import { ConfirmAction } from "@/components/confirm-action";
import { PinButton } from "@/components/pin-button";
import {
  deleteAnnouncement,
  saveAnnouncement,
  setPinned,
} from "@/app/(app)/announcements/actions";
import type { AnnouncementRow } from "@/lib/announcements";
import { formatWhen, timeAgo } from "@/lib/when";

// The feed. Pinned posts sit on a navy band so they read first; the rest are hairline-ruled rows.
export function AnnouncementList({
  rows,
  classroomId,
  canPost,
  now,
}: {
  rows: AnnouncementRow[];
  classroomId: string | null;
  canPost: boolean;
  now: number;
}) {
  return (
    <ul className="grid">
      {rows.map((a) => {
        const edited =
          Date.parse(a.updated_at) - Date.parse(a.created_at) > 60_000;
        const meta = [
          a.author?.full_name,
          timeAgo(a.created_at, now),
          edited ? "edited" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li
            key={a.id}
            className={
              a.pinned
                ? "mb-3 grid gap-3 bg-field px-4 py-5 text-on-field sm:px-6"
                : "grid gap-3 border-b border-rule px-1 py-5 first:border-t sm:px-3"
            }
          >
            <article className="grid gap-2">
              <p
                className={`caps flex items-center gap-2 text-13 ${a.pinned ? "text-on-field-2" : "text-ink-2"}`}
              >
                {a.pinned ? (
                  <>
                    <Pin size={14} strokeWidth={2} aria-hidden />
                    Pinned ·{" "}
                  </>
                ) : null}
                <time dateTime={a.created_at} title={formatWhen(a.created_at)}>
                  {meta}
                </time>
              </p>
              <h3 className="font-display text-[clamp(1.6rem,5.5vw,2.25rem)] leading-[1.02] font-bold [overflow-wrap:anywhere] uppercase">
                {a.title}
              </h3>
              {a.body ? (
                <p
                  className={`max-w-[65ch] text-17 whitespace-pre-line [overflow-wrap:anywhere] ${a.pinned ? "text-on-field" : ""}`}
                >
                  {a.body}
                </p>
              ) : null}
            </article>
            {canPost ? (
              <div
                className={`flex flex-wrap items-start gap-3 pt-1 ${a.pinned ? "[--ink:var(--on-field)] [--band:var(--field-2)] [--ground:var(--field)] [--rule-strong:var(--on-field-2)] [--ink-2:var(--on-field-2)]" : ""}`}
              >
                <PinButton
                  pinned={a.pinned}
                  action={setPinned.bind(null, a.id, !a.pinned)}
                />
                <details className="group max-w-2xl open:order-last open:basis-full">
                  <summary className="caps step inline-flex h-10 cursor-pointer items-center border border-ink px-4 text-15 text-ink hover:bg-band">
                    Edit
                  </summary>
                  <div className="pt-5">
                    <AnnouncementForm
                      action={saveAnnouncement.bind(null, classroomId, a.id)}
                      initial={{
                        title: a.title,
                        body: a.body,
                        pinned: a.pinned,
                      }}
                      submitLabel="Save"
                      pendingLabel="Saving"
                    />
                  </div>
                </details>
                <ConfirmAction
                  action={deleteAnnouncement.bind(null, a.id)}
                  label="Delete"
                  confirmLabel="Delete"
                  pendingLabel="Deleting"
                  question={`Delete "${a.title}"?`}
                  compact
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
