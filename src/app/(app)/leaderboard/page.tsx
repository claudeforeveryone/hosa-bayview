import type { Metadata } from "next";
import { BoardView } from "@/components/board-view";
import { HonorRoll } from "@/components/honor-roll";
import { PageTitle } from "@/components/page-title";
import { parseMetric, parsePeriod, rankBoard } from "@/lib/activity";
import { getBoard, getHonorRoll } from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage(
  props: PageProps<"/leaderboard">,
) {
  const sp = await props.searchParams;
  const metric = parseMetric(sp.metric);
  const period = parsePeriod(sp.period);
  const [me, board, honor] = await Promise.all([
    requireProfile(),
    getBoard(period, null),
    getHonorRoll(),
  ]);
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-10">
      <PageTitle meta="All of HOSA Bayview">Leaderboard</PageTitle>
      <BoardView
        base="/leaderboard"
        metric={metric}
        period={period}
        rows={rankBoard(board, metric, period)}
        meId={me.id}
        empty="Nothing ranked yet"
        elo
        rise
      />
      <HonorRoll rows={honor} />
    </div>
  );
}
