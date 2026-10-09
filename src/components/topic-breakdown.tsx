import { barWidth, topicTotal, totalState, type TopicRow } from "@/lib/resources";

// A thin track with a fill. The width is the topic's share of the exam.
export function TopicBar({ percent }: { percent: number }) {
  return (
    <span aria-hidden className="block h-1.5 w-full bg-band">
      <span className="block h-full bg-ink" style={{ width: `${barWidth(percent)}%` }} />
    </span>
  );
}

export function TopicTotal({ total }: { total: number }) {
  const { state, off } = totalState(total);
  return (
    <p className="caps flex flex-wrap items-baseline gap-x-3 text-[16px]">
      <span>Total</span>
      <span className="num font-display text-[28px] leading-none font-bold text-ink">{total}%</span>
      {state === "exact" ? (
        <span className="text-ok">Adds to 100</span>
      ) : (
        <span className="text-danger">
          {state === "under" ? `${off}% short of 100` : `${off}% over 100`}
        </span>
      )}
    </p>
  );
}

// Read-only breakdown for members and anyone who doesn't run the room.
export function TopicList({ rows }: { rows: Pick<TopicRow, "id" | "topic" | "percent">[] }) {
  return (
    <div className="grid gap-5">
      <ul className="border-t border-rule">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-rule px-1 py-4 sm:px-3">
            <span className="min-w-0 truncate text-[19px] font-semibold">{r.topic}</span>
            <span className="num font-display text-[24px] font-semibold">{r.percent}%</span>
            <span className="col-span-2">
              <TopicBar percent={r.percent} />
            </span>
          </li>
        ))}
      </ul>
      <TopicTotal total={topicTotal(rows)} />
    </div>
  );
}
