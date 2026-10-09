import { BoardView } from "@/components/board-view";
import { parsePeriod, rankBoard } from "@/lib/activity";
import { getBoard } from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";

// The classroom's board: ranked by Elo only, with the period switch. Gained in the period, total for all time.
export default async function BoardTab(props: PageProps<"/c/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const period = parsePeriod(sp.period);
  const [me, board] = await Promise.all([
    requireProfile(),
    getBoard(period, id),
  ]);
  return (
    <BoardView
      base={`/c/${id}`}
      metric="elo"
      metrics={["elo"]}
      period={period}
      rows={rankBoard(board, "elo", period)}
      meId={me.id}
      empty="No one's on the board yet"
    />
  );
}
