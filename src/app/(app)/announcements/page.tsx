import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AnnouncementForm } from "@/components/announcement-form";
import { AnnouncementInbox } from "@/components/announcement-inbox";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import {
  channelHref,
  channelLabel,
  CHAPTER_LABEL,
  inChannel,
  parseChannel,
  postChannels,
  type Channel,
} from "@/lib/announcement-channels";
import { getAnnouncementInbox, getAnnouncementStates } from "@/lib/announcements";
import { requireProfile } from "@/lib/auth";
import { getMyClassrooms } from "@/lib/classrooms";
import { postAnnouncement } from "./actions";

export const metadata: Metadata = { title: "Announcements" };

// Every announcement you get as an inbox, in channels: the chapter (executives post) and one per event room
// you're in (its trainers, leads and the executives post). Subject lines, unread ones highlighted; open one to
// read it, mark it read or delete it from your list (0280). Each room's news also shows on its Overview.
export default async function AnnouncementsPage(props: PageProps<"/announcements">) {
  const sp = await props.searchParams;
  const [me, rooms] = await Promise.all([requireProfile(), getMyClassrooms()]);
  const channel = parseChannel(sp.channel, rooms);
  const all = await getAnnouncementInbox(rooms.map((r) => r.id));
  const states = await getAnnouncementStates(all.map((a) => a.id));
  const kept = all.filter((a) => !states.get(a.id)?.deleted && inChannel(a.classroom_id, "all", rooms));
  const rows = kept
    .filter((a) => inChannel(a.classroom_id, channel, rooms))
    .map((a) => ({ ...a, channel: channel === "all" ? channelLabel(a.classroom_id, rooms) : undefined }));
  const unread = rows.filter((a) => !states.get(a.id)?.read).length;
  const unreadIn = (c: Channel) =>
    kept.filter((a) => inChannel(a.classroom_id, c, rooms) && !states.get(a.id)?.read).length;
  const exec = me.role === "executive";
  const targets = postChannels(exec, rooms, channel);
  const here = channel === "all" ? "" : channel === "chapter" ? CHAPTER_LABEL : channelLabel(channel, rooms);
  // eslint-disable-next-line react-hooks/purity -- server render time, once per request
  const now = Date.now();

  const tabs: { value: Channel; label: string }[] = [
    { value: "all", label: "All" },
    { value: "chapter", label: CHAPTER_LABEL },
    ...rooms.map((r) => ({ value: r.id, label: r.name })),
  ];

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle meta={rows.length ? (unread ? `${unread} unread` : "All read") : "Chapter and event news"}>
        Announcements
      </PageTitle>

      {rooms.length ? (
        <nav aria-label="Channels" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {tabs.map((t) => {
              const on = t.value === channel;
              const n = t.value === "all" ? 0 : unreadIn(t.value);
              return (
                <li key={t.value}>
                  <Link
                    href={channelHref(t.value)}
                    aria-current={on ? "page" : undefined}
                    className={`caps step inline-flex h-11 max-w-[16rem] items-center gap-2 border px-3 text-15 whitespace-nowrap ${
                      on ? "border-ink bg-ink text-ground" : "border-rule-strong text-ink-2 hover:bg-band hover:text-ink"
                    }`}
                  >
                    <span className="truncate">{t.label}</span>
                    {n ? (
                      <span className={`num px-1 text-12 leading-none ${on ? "bg-ground text-ink" : "bg-you text-on-you"}`}>
                        {n}
                        <span className="sr-only"> unread</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {targets.length ? (
        <details className="group border-y border-rule" open={kept.length === 0}>
          <summary className="caps step flex h-14 cursor-pointer items-center justify-between px-1 text-18 hover:bg-band sm:px-3">
            Post an announcement
            <Plus size={22} strokeWidth={1.75} aria-hidden className="group-open:rotate-45" />
          </summary>
          <div className="px-1 pt-2 pb-8 sm:px-3">
            <AnnouncementForm
              action={postAnnouncement}
              channels={targets}
              submitLabel="Post"
              pendingLabel="Posting"
              resetOnSave
            />
          </div>
        </details>
      ) : null}

      {rows.length ? (
        <AnnouncementInbox rows={rows} states={states} now={now} />
      ) : (
        <EmptyState title="Quiet for now">
          {all.length && channel === "all"
            ? "You've deleted every announcement from your list. New ones land here."
            : here
              ? `Nothing in ${here} yet. New posts land here and you get a notification.`
              : targets.length
                ? "Post the first one above. Everyone in that channel gets a notification."
                : "When the execs or your trainers post news, it shows up here."}
        </EmptyState>
      )}
    </div>
  );
}
