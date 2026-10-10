import { Plus } from "lucide-react";
import { AnnouncementForm } from "@/components/announcement-form";
import { AnnouncementList } from "@/components/announcement-list";
import { BoardView } from "@/components/board-view";
import {
  HubResources,
  PracticeStrip,
  hubHeading,
  type PracticeCell,
} from "@/components/event-hub";
import { parseMetric, parsePeriod, rankBoard } from "@/lib/activity";
import { getBoard } from "@/lib/activity-data";
import { getAnnouncements } from "@/lib/announcements";
import { requireProfile } from "@/lib/auth";
import { getClassroom, getRoomInfo, uuid } from "@/lib/classrooms";
import { listDecks } from "@/lib/decks";
import { createClient } from "@/lib/supabase/server";
import { getClassroomTests } from "@/lib/tests";
import { saveAnnouncement } from "@/app/(app)/announcements/actions";
import { getSkills } from "./skills/queries";

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

// Only the section column: the hub counts files per section and never opens them, so no signed URLs.
async function getMaterialSections(
  classroomId: string,
): Promise<{ section: string | null }[]> {
  if (!uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("section")
    .eq("classroom_id", classroomId);
  if (error) throw new Error(`Library lookup failed: ${error.message}`);
  return (data ?? []) as { section: string | null }[];
}

// The event's hub: class news (pinned first), resources by section, what there is to practise, then this
// room's board, which ranks only work done here. Every count is what this viewer can open.
export default async function BoardTab(props: PageProps<"/c/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const metric = sp.metric ? parseMetric(sp.metric) : "answered";
  const period = parsePeriod(sp.period);
  const [me, board, room, info, news, sections, tests, decks] =
    await Promise.all([
      requireProfile(),
      getBoard(period, id),
      getClassroom(id),
      getRoomInfo(id),
      getAnnouncements(id, 10),
      getMaterialSections(id),
      getClassroomTests(id),
      listDecks(id),
    ]);
  const category = info?.category ?? null;
  const skills = category === "practical" ? await getSkills(id) : [];
  const canPost = Boolean(room?.can_manage);
  const base = `/c/${id}`;
  // eslint-disable-next-line react-hooks/purity -- server render time, once per request
  const now = Date.now();

  // Members only ever get published tests back; managers also see drafts, counted on their own.
  const published = tests.filter((t) => t.is_published).length;
  const drafts = tests.length - published;
  const cells: PracticeCell[] = [];
  if (category !== "showcase") {
    cells.push({
      slug: "tests",
      label: plural(published, "Test"),
      count: published,
      extra:
        canPost && drafts
          ? `${drafts} ${drafts === 1 ? "draft" : "drafts"}`
          : null,
    });
  }
  cells.push({
    slug: "flashcards",
    label: plural(decks.length, "Deck"),
    count: decks.length,
  });
  if (category === "practical")
    cells.push({
      slug: "skills",
      label: plural(skills.length, "Skill"),
      count: skills.length,
    });

  return (
    <div className="grid grid-cols-1 gap-12">
      {news.length || canPost ? (
        <section aria-labelledby="news-h" className="grid gap-4">
          <h2 id="news-h" className={hubHeading}>
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

      <HubResources base={base} rows={sections} canManage={canPost} />

      <PracticeStrip base={base} cells={cells} />

      <section aria-labelledby="board-h" className="grid gap-4">
        <h2 id="board-h" className={hubHeading}>
          Leaderboard
        </h2>
        <BoardView
          base={base}
          metric={metric}
          period={period}
          rows={rankBoard(board, metric, period)}
          meId={me.id}
          empty="No one's on the board yet"
          scope="room"
        />
      </section>
    </div>
  );
}
