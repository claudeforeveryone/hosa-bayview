"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { BoardMenu } from "@/components/board-menu";
import { loadBoard } from "@/app/(app)/leaderboard/actions";
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
  rankBoard,
  type BoardRow,
  type BoardScope,
  type Metric,
  type Period,
  type RankedRow,
} from "@/lib/activity";
import {
  BOARD_PAGE_SIZE,
  clampPage,
  pageButtons,
  pageCount,
  pageOfIndex,
  pageSlice,
} from "@/lib/board-pages";

type Props = {
  classroomId: string | null; // the room whose board this is; null for the whole chapter
  metric: Metric;
  period: Period;
  rows: BoardRow[]; // the board for `period`, unranked; other periods load in place
  meId: string;
  empty: string;
  limit?: number; // a short board (Home's top five): no pages
  more?: { href: string; text: string }; // link to the full board when the list is cut short
  elo?: boolean; // show the Elo footnote
  metrics?: readonly Metric[]; // measures to offer; a single one hides the measure switch
  scope?: BoardScope; // a room board calls its score Points, the chapter board Elo
  rise?: boolean; // the full board's rows rise in once; Home's short board stays still
  showPlace?: boolean; // "You're #3 of 15" on the controls row's left (Home)
  page?: number; // the page to open on (?page= on a reload)
};

// Keeps the address in step with the board, so a reload or a shared link opens the same view. No navigation:
// the page stays put.
function writeUrl(metric: Metric, period: Period, page: number) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("metric", metric);
    url.searchParams.set("period", period);
    if (page > 1) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // An odd address just isn't updated; the board itself still changes.
  }
}

const calm = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.dataset.motion === "calm";

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

// One board: the measure and period toggles, the ranked rows (20 a page on the full boards), and the empty state.
// Measure, period and page all change in place, so the page never jumps back to the top.
export function BoardView({
  classroomId,
  metric: initialMetric,
  period: initialPeriod,
  rows: initialRows,
  meId,
  empty,
  limit,
  more,
  elo,
  metrics = METRICS,
  scope = "chapter",
  rise = false,
  showPlace = false,
  page: initialPage = 1,
}: Props) {
  const [metric, setMetric] = useState(initialMetric);
  const [period, setPeriod] = useState(initialPeriod);
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Boards already fetched, by period, so switching back is instant.
  const cache = useRef(new Map<Period, BoardRow[]>([[initialPeriod, initialRows]]));
  const latest = useRef(0);
  const top = useRef<HTMLDivElement>(null);
  const turned = useRef(false);

  const ranked = rankBoard(rows, metric, period);
  const paged = !limit;
  const count = paged ? pageCount(ranked.length) : 1;
  const current = clampPage(page, ranked.length);
  const shown = limit ? ranked.slice(0, limit) : pageSlice(ranked, current);
  const meIndex = ranked.findIndex((r) => r.user_id === meId);
  const mePage = pageOfIndex(meIndex);
  const place = meIndex >= 0 ? ranked[meIndex].place : null;
  const since = periodSince(period, new Date());

  // After a page turn, bring the top of the list back into view if it scrolled off above.
  useEffect(() => {
    if (!turned.current) return;
    turned.current = false;
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0)
      el.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
  }, [current]);

  const goTo = (next: number) => {
    const p = clampPage(next, ranked.length);
    if (p === current) return;
    turned.current = true;
    setPage(p);
    writeUrl(metric, period, p);
  };

  const pickMetric = (value: string) => {
    const m = value as Metric;
    setMetric(m);
    setPage(1);
    writeUrl(m, period, 1);
  };

  const pickPeriod = (value: string) => {
    const p = value as Period;
    setError(null);
    setPage(1);
    const known = cache.current.get(p);
    if (known) {
      latest.current += 1;
      setPeriod(p);
      setRows(known);
      writeUrl(metric, p, 1);
      return;
    }
    const ticket = ++latest.current;
    start(async () => {
      const result = await loadBoard(p, classroomId);
      // A later pick wins over a slow earlier one.
      if (ticket !== latest.current) return;
      if ("error" in result) {
        setError(result.error);
        return;
      }
      cache.current.set(p, result.rows);
      setPeriod(p);
      setRows(result.rows);
      writeUrl(metric, p, 1);
    });
  };

  return (
    <div ref={top} className="grid scroll-mt-4 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 px-2 sm:px-3">
        {showPlace && place ? (
          <p className="caps num text-15 text-ink-2">
            You&apos;re #{place} of {ranked.length}
          </p>
        ) : null}
        {metrics.length > 1 ? (
          <BoardMenu
            label="Measure"
            lead="Ranked by"
            current={metric}
            onPick={pickMetric}
            items={metrics.map((m) => ({ value: m, text: metricLabel(m, scope) }))}
          />
        ) : null}
        <div className="ml-auto">
          <BoardMenu
            label="Period"
            current={period}
            align="end"
            onPick={pickPeriod}
            items={PERIODS.map((p) => ({ value: p, text: PERIOD_LABEL[p] }))}
          />
        </div>
      </div>
      {since ? (
        <p className="caps -mt-2 px-2 text-15 text-ink-2 sm:px-3">Since {since}</p>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 text-15 text-danger sm:px-3">
          {error}
        </p>
      ) : null}
      <div
        aria-busy={pending || undefined}
        className={pending ? "opacity-50 motion-safe:transition-opacity" : undefined}
      >
        {shown.length ? (
          <ol
            className="border-t border-rule"
            start={paged ? (current - 1) * BOARD_PAGE_SIZE + 1 : undefined}
          >
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
      </div>
      {paged && count > 1 ? (
        <Pager
          current={current}
          count={count}
          total={ranked.length}
          mePage={mePage}
          onGo={goTo}
        />
      ) : null}
      {more && ranked.length > shown.length ? (
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

// Left and right arrows with the page numbers between them, and a jump to your own page.
function Pager({
  current,
  count,
  total,
  mePage,
  onGo,
}: {
  current: number;
  count: number;
  total: number;
  mePage: number | null;
  onGo: (page: number) => void;
}) {
  const from = (current - 1) * BOARD_PAGE_SIZE + 1;
  const to = Math.min(current * BOARD_PAGE_SIZE, total);
  const arrow =
    "step press grid size-12 shrink-0 place-items-center border-2 border-ink text-ink hover:bg-band disabled:border-rule-strong disabled:text-ink-2 disabled:hover:bg-transparent";
  return (
    <nav aria-label="Leaderboard pages" className="grid gap-2 px-2 sm:px-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onGo(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
          className={arrow}
        >
          <ChevronLeft size={22} strokeWidth={2.25} aria-hidden />
        </button>
        <ul className="flex min-w-0 flex-1 items-center justify-center gap-1">
          {pageButtons(current, count).map((n, i) =>
            n === null ? (
              <li key={`gap-${i}`} aria-hidden className="num px-1 text-15 text-ink-2">
                …
              </li>
            ) : (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => onGo(n)}
                  aria-current={n === current ? "page" : undefined}
                  aria-label={`Page ${n}`}
                  className={`num step grid h-11 min-w-9 place-items-center px-1.5 font-display text-17 font-bold sm:min-w-11 ${
                    n === current
                      ? "bg-ink text-ground"
                      : "text-ink hover:bg-band"
                  }`}
                >
                  {n}
                </button>
              </li>
            ),
          )}
        </ul>
        <button
          type="button"
          onClick={() => onGo(current + 1)}
          disabled={current >= count}
          aria-label="Next page"
          className={arrow}
        >
          <ChevronRight size={22} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="caps num text-14 text-ink-2" aria-live="polite">
          {from}–{to} of {total}
        </p>
        {mePage && mePage !== current ? (
          <button
            type="button"
            onClick={() => onGo(mePage)}
            className="caps step min-h-11 text-14 underline decoration-2 underline-offset-4 hover:text-ink"
          >
            Find me (page {mePage})
          </button>
        ) : null}
      </div>
    </nav>
  );
}
