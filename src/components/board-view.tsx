import Link from "next/link";
import type { CSSProperties } from "react";
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
};

const toggleHref = (base: string, metric: Metric, period: Period) =>
  `${base}?metric=${metric}&period=${period}`;

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
    `${metricLabel("elo", scope)} ${formatCount(row.elo)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-rule px-1 py-2 sm:px-3 ${
        // Your row is banded, so it's easy to find in a long board.
        you ? "bg-band" : ""
      } ${rise ? "rise" : ""}`}
      style={rise ? ({ "--i": index } as CSSProperties) : undefined}
    >
      <span
        className={`num font-display font-bold ${
          // The top three get poster-scale numerals; everyone else stays quiet.
          row.place !== null && row.place <= 3
            ? "text-[30px] leading-none text-ink"
            : "text-[20px] font-semibold text-ink-2"
        }`}
      >
        {row.place ?? "—"}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar
            name={row.full_name || "Member"}
            src={row.avatar_url ?? null}
            size="sm"
          />
          <Link
            href={`/members/${row.user_id}`}
            className="step min-w-0 truncate font-display text-[18px] leading-tight font-semibold uppercase hover:underline sm:text-[20px]"
          >
            {row.full_name || "Member"}
          </Link>
          {you ? (
            <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-[13px] leading-none text-on-you">
              You
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[13px] text-ink-2">{caption}</span>
      </span>
      <span className="num font-display text-[22px] leading-none font-bold">
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
}: Props) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const since = periodSince(period, new Date());
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 px-1 sm:px-3">
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
        <p className="caps text-[15px] text-ink-2">Since {since}</p>
      ) : null}
      {shown.length ? (
        <ol className="border-t border-rule">
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
          className="caps step justify-self-start text-[17px] underline underline-offset-4"
        >
          {more.text}
        </Link>
      ) : null}
      {elo ? (
        <p className="max-w-[65ch] text-[15px] text-ink-2">{ELO_SUMMARY}</p>
      ) : null}
    </div>
  );
}
