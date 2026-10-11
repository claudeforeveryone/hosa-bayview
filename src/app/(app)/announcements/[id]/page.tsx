import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pin } from "lucide-react";
import { AnnouncementForm } from "@/components/announcement-form";
import { AnnouncementReadToggle } from "@/components/announcement-read-toggle";
import { ConfirmAction } from "@/components/confirm-action";
import { PinButton } from "@/components/pin-button";
import { getAnnouncement, getAnnouncementStates } from "@/lib/announcements";
import { requireProfile } from "@/lib/auth";
import { formatWhen } from "@/lib/when";
import {
  deleteAnnouncementAndLeave,
  deleteFromInboxAndLeave,
  saveAnnouncement,
  setPinned,
} from "../actions";

export const metadata: Metadata = { title: "Announcement" };

// One announcement, opened from the inbox like an email. It stays here until you delete it from your list;
// Mark as read only changes how it looks there. Executives also get pin, edit and delete for everyone.
export default async function AnnouncementPage({ params }: PageProps<"/announcements/[id]">) {
  const { id } = await params;
  const [me, a] = await Promise.all([requireProfile(), getAnnouncement(id)]);
  if (!a) notFound();
  const state = (await getAnnouncementStates([a.id])).get(a.id);
  const exec = me.role === "executive";
  const edited = Date.parse(a.updated_at) - Date.parse(a.created_at) > 60_000;

  return (
    <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-8">
      <Link
        href="/announcements"
        className="caps step inline-flex h-11 items-center gap-2 justify-self-start text-15 text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={18} strokeWidth={2} aria-hidden />
        All announcements
      </Link>

      <article className="grid gap-5 border-[3px] border-ink p-5 sm:p-7">
        <header className="grid gap-3 border-b-[3px] border-ink pb-4">
          {a.pinned ? (
            <p className="caps flex items-center gap-1.5 text-13 text-ink-2">
              <Pin size={14} strokeWidth={2} aria-hidden />
              Pinned
            </p>
          ) : null}
          <h1 className="font-display text-[clamp(2rem,7vw,3rem)] leading-[1.02] font-bold [overflow-wrap:anywhere] uppercase">
            {a.title}
          </h1>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-15">
            <dt className="caps text-ink-2">From</dt>
            <dd>{a.author?.full_name ?? "An executive"}</dd>
            <dt className="caps text-ink-2">Sent</dt>
            <dd className="num">
              <time dateTime={a.created_at}>{formatWhen(a.created_at)}</time>
              {edited ? <span className="text-ink-2"> · edited</span> : null}
            </dd>
          </dl>
        </header>
        {a.body ? (
          <p className="max-w-[65ch] text-18 leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">{a.body}</p>
        ) : (
          <p className="text-17 text-ink-2">No message, just the headline.</p>
        )}
      </article>

      <div className="flex flex-wrap items-start gap-3">
        <AnnouncementReadToggle id={a.id} read={state?.read ?? false} />
        <ConfirmAction
          action={deleteFromInboxAndLeave.bind(null, a.id)}
          label="Delete announcement"
          confirmLabel="Delete from my list"
          pendingLabel="Deleting"
          question="Take it out of your announcements? Others still see it."
        />
      </div>

      {exec && a.classroom_id === null ? (
        <section aria-labelledby="manage-h" className="grid gap-4 border-t-[3px] border-ink pt-6">
          <h2 id="manage-h" className="caps text-17">
            For executives
          </h2>
          <div className="flex flex-wrap items-start gap-3">
            <PinButton pinned={a.pinned} action={setPinned.bind(null, a.id, !a.pinned)} />
            <details className="group max-w-2xl open:order-last open:basis-full">
              <summary className="caps step inline-flex h-10 cursor-pointer items-center border border-ink px-4 text-15 text-ink hover:bg-band">
                Edit
              </summary>
              <div className="pt-5">
                <AnnouncementForm
                  action={saveAnnouncement.bind(null, null, a.id)}
                  initial={{ title: a.title, body: a.body, pinned: a.pinned }}
                  submitLabel="Save"
                  pendingLabel="Saving"
                />
              </div>
            </details>
            <ConfirmAction
              action={deleteAnnouncementAndLeave.bind(null, a.id)}
              label="Delete for everyone"
              confirmLabel="Delete for everyone"
              pendingLabel="Deleting"
              question={`Delete "${a.title}" for the whole chapter?`}
              compact
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
