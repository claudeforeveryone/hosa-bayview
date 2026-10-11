import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { BoardMenu } from "@/components/board-menu";
import {
  ELO_SUMMARY,
  METRICS,
  PERIODS,
  PERIOD_LABEL,
  formatCount,
  formatPercent,
  formatValue,
  metricLabel,
  periodSince,
  type BoardScope,
  type Metric,
  type Period,
  type RankedRow,
} from "@/lib/activity";

type Props = {
  base: string; // route the toggles link back to
  metric: Metric;
  period: Period;
  rows: RankedRow[];
  meId: string;
  empty: string;
  limit?: number;
  more?: { href: string; text: string }; // link to the full board when the list is cut short
  elo?: boolean; // show the Elo footnote
  metrics?: readonly Metric[]; // measures to offer; a single one hides the measure switch
  scope?: BoardScope; // a room board calls its score Points, the chapter board Elo
  rise?: boolean; // the full board's rows rise in once; Home's short board stays still
  lead?: ReactNode; // a short line on the controls row's left, e.g. Home's "You're #3 of 15"
};

const toggleHref = (base: string, metric: Metric, period: Period) =>
  `${base}?metric=${metric}&period=${period}`;

// First, second and third: a gold, silver or bronze tile for the numeral and the same metal down the row's edge.
const MEDALS = {
  1: { tile: "bg-gold", edge: "border-l-gold", name: "gold" },
  2: { tile: "bg-silver", edge: "border-l-silver", name: "silver" },
  3: { tile: "bg-bronze", edge: "border-l-bronze", name: "bronze" },
} as const;

function BoardLine({
  row,
  metric,
  period,
  you,
  scope,
  index,
  rise,
}: {
  row: RankedRow;
  metric: Metric;
  period: Period;
  you: boolean;
  scope: BoardScope;
  index: number;
  rise: boolean;
}) {
  const count = (n: number, word: string) =>
    `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;
  const caption = [
    count(row.reviews, "card"),
    count(row.answered, "question"),
    row.accuracy === null ? null : formatPercent(row.accuracy),
    // All-time Elo already sits on the right, so don't say it twice; other periods show period points there.
    metric === "elo" && period === "all" ? null : `${metricLabel("elo", scope)} ${formatCount(row.elo)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const medal = row.place === 1 || row.place === 2 || row.place === 3 ? MEDALS[row.place] : null;
  return (
    <li
      className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule px-2 py-2.5 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:px-3 ${
        // Your row is banded, so it's easy to find in a long board.
        you ? "bg-band" : ""
      } ${medal ? `border-l-[6px] ${medal.edge} pl-1 sm:pl-2` : ""} ${rise ? "rise" : ""}`}
      style={rise ? ({ "--i": index } as CSSProperties) : undefined}
    >
      {medal ? (
        // The top three get a medal tile; everyone else stays quiet. One centred column either way.
        <span
          className={`num grid size-10 place-items-center justify-self-center font-display text-26 leading-none font-bold text-on-medal sm:size-11 sm:text-30 ${medal.tile}`}
        >
          {row.place}
          <span className="sr-only"> ({medal.name})</span>
        </span>
      ) : (
        <span className="num text-center font-display text-20 leading-none font-semibold text-ink-2">
          {row.place ?? "—"}
        </span>
      )}
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar
            name={row.full_name || "Member"}
            src={row.avatar_url ?? null}
            size="sm"
          />
          <Link
            href={`/members/${row.user_id}`}
            className="step -my-1.5 min-w-0 truncate py-1.5 font-display text-18 leading-tight font-semibold uppercase hover:underline sm:text-20"
          >
            {row.full_name || "Member"}
          </Link>
          {you ? (
            <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-13 leading-none text-on-you">
              You
            </span>
          ) : null}
        </span>
        <span className="block truncate text-13 text-ink-2">{caption}</span>
      </span>
      <span className="num min-w-12 text-right font-display text-22 leading-none font-bold">
        {formatValue(row.value, metric, period)}
      </span>
    </li>
  );
}

// One board: the measure and period toggles, the ranked rows, and the empty state.
export function BoardView({
  base,
  metric,
  period,
  rows,
  meId,
  empty,
  limit,
  more,
  elo,
  metrics = METRICS,
  scope = "chapter",
  rise = false,
  lead,
}: Props) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const since = periodSince(period, new Date());
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 px-2 sm:px-3">
        {lead ? <p className="caps num text-15 text-ink-2">{lead}</p> : null}
        {metrics.length > 1 ? (
          <BoardMenu
            label="Measure"
            lead="Ranked by"
            current={metric}
            items={metrics.map((m) => ({
              value: m,
              text: metricLabel(m, scope),
              href: toggleHref(base, m, period),
            }))}
          />
        ) : null}
        <div className="ml-auto">
          <BoardMenu
            label="Period"
            current={period}
            align="end"
            items={PERIODS.map((p) => ({
              value: p,
              text: PERIOD_LABEL[p],
              href: toggleHref(base, metric, p),
            }))}
          />
        </div>
      </div>
      {since ? (
        <p className="caps -mt-2 px-2 text-15 text-ink-2 sm:px-3">Since {since}</p>
      ) : null}
      {shown.length ? (
        <ol className="border-t border-rule">
          <li
            aria-hidden
            className="caps grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-3 border-b border-rule px-2 py-1.5 text-13 text-ink-2 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:px-3"
          >
            <span className="text-center">#</span>
            <span>Member</span>
            <span className="text-right">{metricLabel(metric, scope)}</span>
          </li>
          {shown.map((row, index) => (
            <BoardLine
              key={row.user_id}
              row={row}
              metric={metric}
              period={period}
              you={row.user_id === meId}
              scope={scope}
              index={index}
              rise={rise}
            />
          ))}
        </ol>
      ) : (
        <EmptyState title={empty} />
      )}
      {more && rows.length > shown.length ? (
        <Link
          href={more.href}
          className="caps step justify-self-start text-17 underline underline-offset-4"
        >
          {more.text}
        </Link>
      ) : null}
      {elo ? (
        <details className="group max-w-[65ch]">
          <summary className="caps step inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-14 text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            How Elo works
            <ChevronDown
              size={16}
              strokeWidth={2}
              aria-hidden
              className="group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
            />
          </summary>
          <p className="pb-2 text-15 text-ink-2">{ELO_SUMMARY}</p>
        </details>
      ) : null}
    </div>
  );
}
