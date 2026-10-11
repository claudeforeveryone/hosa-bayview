import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { AnnouncementForm } from "@/components/announcement-form";
import { AnnouncementInbox } from "@/components/announcement-inbox";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { getAnnouncementStates, getAnnouncements } from "@/lib/announcements";
import { requireProfile } from "@/lib/auth";
import { saveAnnouncement } from "./actions";

export const metadata: Metadata = { title: "Announcements" };

// The chapter's announcements as an inbox: subject lines, unread ones highlighted. Open one to read it, mark it
// read or delete it from your list (0280). Executives post here and pin, edit or delete for everyone from the
// announcement's page. Class news lives on each class's Board.
export default async function AnnouncementsPage() {
  const [me, all] = await Promise.all([
    requireProfile(),
    getAnnouncements(null),
  ]);
  const states = await getAnnouncementStates(all.map((a) => a.id));
  const rows = all.filter((a) => !states.get(a.id)?.deleted);
  const unread = rows.filter((a) => !states.get(a.id)?.read).length;
  const exec = me.role === "executive";
  // eslint-disable-next-line react-hooks/purity -- server render time, once per request
  const now = Date.now();

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle meta={rows.length ? (unread ? `${unread} unread` : "All read") : "Chapter news from the execs"}>
        Announcements
      </PageTitle>
      {exec ? (
        <details
          className="group border-y border-rule"
          open={all.length === 0}
        >
          <summary className="caps step flex h-14 cursor-pointer items-center justify-between px-1 text-18 hover:bg-band sm:px-3">
            Post to the chapter
            <Plus
              size={22}
              strokeWidth={1.75}
              aria-hidden
              className="group-open:rotate-45"
            />
          </summary>
          <div className="px-1 pt-2 pb-8 sm:px-3">
            <AnnouncementForm
              action={saveAnnouncement.bind(null, null, null)}
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
          {all.length
            ? "You've deleted every announcement from your list. New ones land here."
            : exec
              ? "Post the first one above. Everyone gets a notification."
              : "When the execs post news, it shows up here."}
        </EmptyState>
      )}
    </div>
  );
}
