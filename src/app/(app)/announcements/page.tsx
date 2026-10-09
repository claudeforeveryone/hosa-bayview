import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { AnnouncementForm } from "@/components/announcement-form";
import { AnnouncementList } from "@/components/announcement-list";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { getAnnouncements } from "@/lib/announcements";
import { requireProfile } from "@/lib/auth";
import { saveAnnouncement } from "./actions";

export const metadata: Metadata = { title: "Announcements" };

// The chapter feed. Executives post, edit and pin; everyone reads. Class news lives on each class's Board.
export default async function AnnouncementsPage() {
  const [me, rows] = await Promise.all([
    requireProfile(),
    getAnnouncements(null),
  ]);
  const exec = me.role === "executive";
  // eslint-disable-next-line react-hooks/purity -- server render time, once per request
  const now = Date.now();

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle meta="Chapter news from the execs">Announcements</PageTitle>
      {exec ? (
        <details
          className="group border-y border-rule"
          open={rows.length === 0}
        >
          <summary className="caps step flex h-14 cursor-pointer items-center justify-between px-1 text-[18px] hover:bg-band sm:px-3">
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
        <AnnouncementList
          rows={rows}
          classroomId={null}
          canPost={exec}
          now={now}
        />
      ) : (
        <EmptyState title="Quiet for now">
          {exec
            ? "Post the first one above. Everyone gets a notification."
            : "When the execs post news, it shows up here."}
        </EmptyState>
      )}
    </div>
  );
}
