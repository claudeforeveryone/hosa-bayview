import { Plus } from "lucide-react";
import { AnnouncementForm } from "@/components/announcement-form";
import { AnnouncementList } from "@/components/announcement-list";
import { BoardView } from "@/components/board-view";
import { parseMetric, parsePeriod, rankBoard } from "@/lib/activity";
import { getBoard } from "@/lib/activity-data";
import { getAnnouncements } from "@/lib/announcements";
import { requireProfile } from "@/lib/auth";
import { getClassroom } from "@/lib/classrooms";
import { saveAnnouncement } from "@/app/(app)/announcements/actions";

// The classroom's board: class news on top, then only this room's questions, cards and time, so it ranks
// work done here. Defaults to questions answered; every measure is one tap away.
export default async function BoardTab(props: PageProps<"/c/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const metric = sp.metric ? parseMetric(sp.metric) : "answered";
  const period = parsePeriod(sp.period);
  const [me, board, room, news] = await Promise.all([
    requireProfile(),
    getBoard(period, id),
    getClassroom(id),
    getAnnouncements(id, 10),
  ]);
  const canPost = Boolean(room?.can_manage);
  // eslint-disable-next-line react-hooks/purity -- server render time, once per request
  const now = Date.now();

  return (
    <div className="grid grid-cols-1 gap-10">
      {news.length || canPost ? (
        <section aria-labelledby="news-h" className="grid gap-4">
          <h2
            id="news-h"
            className="px-1 font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase sm:px-3"
          >
            Class news
          </h2>
          {news.length ? (
            <AnnouncementList
              rows={news}
              classroomId={id}
              canPost={canPost}
              now={now}
            />
          ) : null}
          {canPost ? (
            <details className="group border-y border-rule" open={false}>
              <summary className="caps step flex h-14 cursor-pointer items-center justify-between px-1 text-[17px] hover:bg-band sm:px-3">
                Post to the class
                <Plus
                  size={22}
                  strokeWidth={1.75}
                  aria-hidden
                  className="group-open:rotate-45"
                />
              </summary>
              <div className="px-1 pt-2 pb-8 sm:px-3">
                <AnnouncementForm
                  action={saveAnnouncement.bind(null, id, null)}
                  submitLabel="Post"
                  pendingLabel="Posting"
                  resetOnSave
                />
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
      <BoardView
        base={`/c/${id}`}
        metric={metric}
        period={period}
        rows={rankBoard(board, metric, period)}
        meId={me.id}
        empty="No one's on the board yet"
      />
    </div>
  );
}
