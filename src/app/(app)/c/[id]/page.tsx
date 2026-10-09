import { BoardView } from "@/components/board-view";
import { parseMetric, parsePeriod, rankBoard } from "@/lib/activity";
import { getBoard } from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";

// The classroom's board: the same toggles as Home, scoped to this room's members.
export default async function BoardTab(props: PageProps<"/c/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const metric = parseMetric(sp.metric);
  const period = parsePeriod(sp.period);
  const [me, board] = await Promise.all([requireProfile(), getBoard(period, id)]);
  return (
    <BoardView
      base={`/c/${id}`}
      metric={metric}
      period={period}
      rows={rankBoard(board, metric)}
      meId={me.id}
      empty="No one's on the board yet"
    />
  );
}
