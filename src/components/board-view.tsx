import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import {
  ELO_SUMMARY,
  METRICS,
  METRIC_LABEL,
  PERIODS,
  PERIOD_LABEL,
  formatCount,
  formatHours,
  formatPercent,
  formatValue,
  periodSince,
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
};

const toggleHref = (base: string, metric: Metric, period: Period) =>
  `${base}?metric=${metric}&period=${period}`;

// Plain links, so the board works without client JavaScript and the URL is shareable.
// Measures read as tabs on a hairline; the period is a quieter text switch beside them.
function Toggles({
  label,
  items,
  current,
  make,
  quiet = false,
}: {
  label: string;
  items: { value: string; text: string }[];
  current: string;
  make: (value: string) => string;
  quiet?: boolean;
}) {
  return (
    <nav aria-label={label}>
      <ul
        className={`flex flex-wrap ${quiet ? "gap-x-4" : "gap-x-3.5 sm:gap-x-5"}`}
      >
        {items.map(({ value, text }) => {
          const on = value === current;
          return (
            <li key={value}>
              <Link
                href={make(value)}
                aria-current={on ? "true" : undefined}
                className={`caps step inline-flex min-h-11 items-center ${
                  quiet
                    ? `text-[14px] ${on ? "text-ink" : "text-ink-2 hover:text-ink"}`
                    : `-mb-px border-b-2 text-[14px] sm:text-[15px] ${on ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"}`
                }`}
              >
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BoardLine({
  row,
  metric,
  you,
}: {
  row: RankedRow;
  metric: Metric;
  you: boolean;
}) {
  const caption = [
    `${formatHours(row.minutes)} h`,
    `${formatCount(row.reviews)} cards`,
    `${formatCount(row.answered)} questions`,
    formatPercent(row.accuracy),
    `Elo ${formatCount(row.elo)}`,
  ].join(" · ");
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule px-1 py-3 sm:px-3">
      <span className="num font-display text-[26px] font-semibold text-ink-2">
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
            className="step truncate font-display text-[clamp(1.4rem,5vw,1.9rem)] leading-tight font-semibold uppercase hover:underline"
          >
            {row.full_name || "Member"}
          </Link>
          {you ? (
            <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-[13px] leading-none text-on-you">
              You
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[15px] text-ink-2">{caption}</span>
      </span>
      <span className="num font-display text-[clamp(1.6rem,6vw,2.2rem)] leading-none font-bold">
        {formatValue(row.value, metric)}
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
}: Props) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const since = periodSince(period, new Date());
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 border-b border-rule px-1 sm:px-3">
        <Toggles
          label="Measure"
          items={METRICS.map((m) => ({ value: m, text: METRIC_LABEL[m] }))}
          current={metric}
          make={(m) => toggleHref(base, m as Metric, period)}
        />
        <Toggles
          label="Period"
          items={PERIODS.map((p) => ({ value: p, text: PERIOD_LABEL[p] }))}
          current={period}
          make={(p) => toggleHref(base, metric, p as Period)}
          quiet
        />
      </div>
      {since ? (
        <p className="caps text-[15px] text-ink-2">Since {since}</p>
      ) : null}
      {shown.length ? (
        <ol className="border-t border-rule">
          {shown.map((row) => (
            <BoardLine
              key={row.user_id}
              row={row}
              metric={metric}
              you={row.user_id === meId}
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
