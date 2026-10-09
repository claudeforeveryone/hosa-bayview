import type { Metadata } from "next";
import { BoardView } from "@/components/board-view";
import { PageTitle } from "@/components/page-title";
import { parseMetric, parsePeriod, rankBoard } from "@/lib/activity";
import { getBoard } from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage(props: PageProps<"/leaderboard">) {
  const sp = await props.searchParams;
  const metric = parseMetric(sp.metric);
  const period = parsePeriod(sp.period);
  const [me, board] = await Promise.all([requireProfile(), getBoard(period, null)]);
  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle meta="All of HOSA Bayview">Leaderboard</PageTitle>
      <BoardView
        base="/leaderboard"
        metric={metric}
        period={period}
        rows={rankBoard(board, metric)}
        meId={me.id}
        empty="Nothing ranked yet"
        elo
      />
    </div>
  );
}
