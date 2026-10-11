"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { FavoriteStar } from "@/components/favorite-star";
import { formatCount } from "@/lib/activity";
import {
  CAREER_FILTERS,
  CAREER_FILTER_LABEL,
  CAREER_PAGE,
  CAREER_SORTS,
  CAREER_SORT_LABEL,
  careerCounts,
  careerQuery,
  careerTests,
  filterEntries,
  scopeEntries,
  type CareerScope,
  starredIds,
  groupByDay,
  sortEntries,
  type CareerFilter,
  type CareerSort,
} from "@/lib/career";
import type { CareerItemRow } from "@/lib/career-data";
import { practiceItems } from "@/lib/career-practice";
import { formatTime } from "@/lib/when";

// Every answered question, with what you picked and, when it was wrong, the right answer. Filtering, sorting and
// paging happen here in the browser, so changing them never reloads or jumps the page; the choice is mirrored
// into the URL (replaceState) so a reload or a shared link keeps it. Right and wrong are spelled out, so the
// list reads without colour.
export function MemberCareer({
  rows,
  initialFilter,
  initialSort,
  initialScope,
  canStar,
}: {
  rows: CareerItemRow[];
  initialFilter: CareerFilter;
  initialSort: CareerSort;
  initialScope: CareerScope;
  canStar: boolean; // your own career: stars are yours to change
}) {
  const id = useId();
  const [filter, setFilter] = useState<CareerFilter>(initialFilter);
  const [sort, setSort] = useState<CareerSort>(initialSort);
  const [limit, setLimit] = useState(CAREER_PAGE);
  const [favorites, setFavorites] = useState<Set<string>>(() => starredIds(rows));
  const tests = useMemo(() => careerTests(rows), [rows]);
  // A test that's no longer in the list (a stale link) shows everything instead of nothing.
  const [scope, setScope] = useState<CareerScope>(() => ({
    q: initialScope.q,
    test: tests.some((t) => t.title === initialScope.test) ? initialScope.test : "",
  }));

  // Test and search narrow first; the Show counts then say how many of those are right, wrong or starred.
  const scoped = useMemo(() => scopeEntries(rows, scope), [rows, scope]);
  const counts = useMemo(() => careerCounts(scoped, favorites), [scoped, favorites]);
  const shown = useMemo(
    () => sortEntries(filterEntries(scoped, filter, favorites), sort),
    [scoped, filter, sort, favorites],
  );
  // What a quiz of this view could ask: each question once, only where the key was shown to you.
  const quizable = useMemo(() => practiceItems(scoped, filter, favorites).length, [scoped, filter, favorites]);
  const groups = useMemo(() => groupByDay(shown.slice(0, limit)), [shown, limit]);
  const starsWork = canStar && rows.some((r) => r.question_id !== null);

  function remember(next: { result?: CareerFilter; sort?: CareerSort; test?: string; q?: string }) {
    try {
      const url = new URL(window.location.href);
      if (next.result) url.searchParams.set("result", next.result);
      if (next.sort) url.searchParams.set("sort", next.sort);
      for (const key of ["test", "q"] as const) {
        const v = next[key];
        if (v === undefined) continue;
        if (v) url.searchParams.set(key, v);
        else url.searchParams.delete(key);
      }
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The URL is a convenience; the list already changed.
    }
  }

  function onStar(questionId: string, on: boolean) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (on) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  }

  const filters = starsWork ? CAREER_FILTERS : CAREER_FILTERS.filter((f) => f !== "favorites");
  const narrow = (next: Partial<CareerScope>) => {
    setScope((prev) => ({ ...prev, ...next }));
    setLimit(CAREER_PAGE);
    remember(next);
  };
  const query = careerQuery(filter, scope);
  const field =
    "step h-12 w-full min-w-0 border-2 border-ink bg-ground px-2 text-17 text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 border-2 border-ink bg-band p-3 sm:grid-cols-3 sm:items-end">
        <div className="col-span-2 grid gap-1 sm:col-span-3">
          <label htmlFor={`${id}-q`} className="caps text-14 text-ink-2">
            Search
          </label>
          <div className="relative">
            <Search
              size={20}
              strokeWidth={1.75}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2"
            />
            <input
              id={`${id}-q`}
              type="search"
              value={scope.q}
              onChange={(e) => narrow({ q: e.target.value })}
              placeholder="A word from the question or an answer"
              autoComplete="off"
              enterKeyHint="search"
              className={`${field} pl-10`}
            />
          </div>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-show`} className="caps text-14 text-ink-2">
            Show
          </label>
          <select
            id={`${id}-show`}
            value={filter}
            onChange={(e) => {
              const next = e.target.value as CareerFilter;
              setFilter(next);
              setLimit(CAREER_PAGE);
              remember({ result: next });
            }}
            className={field}
          >
            {filters.map((f) => (
              <option key={f} value={f}>
                {CAREER_FILTER_LABEL[f]} ({formatCount(counts[f])})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-sort`} className="caps text-14 text-ink-2">
            Sort
          </label>
          <select
            id={`${id}-sort`}
            value={sort}
            onChange={(e) => {
              const next = e.target.value as CareerSort;
              setSort(next);
              setLimit(CAREER_PAGE);
              remember({ sort: next });
            }}
            className={field}
          >
            {CAREER_SORTS.map((s) => (
              <option key={s} value={s}>
                {CAREER_SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 grid gap-1 sm:col-span-1">
          <label htmlFor={`${id}-test`} className="caps text-14 text-ink-2">
            Test
          </label>
          <select
            id={`${id}-test`}
            value={scope.test}
            onChange={(e) => narrow({ test: e.target.value })}
            className={field}
          >
            <option value="">Every test</option>
            {tests.map((t) => (
              <option key={t.title} value={t.title}>
                {t.title} ({formatCount(t.count)})
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:col-span-3">
          <p className="num text-15 text-ink-2" aria-live="polite">
            {shown.length ? `${formatCount(Math.min(limit, shown.length))} of ${formatCount(shown.length)}` : "None"}
          </p>
          {scope.q || scope.test ? (
            <button
              type="button"
              onClick={() => narrow({ q: "", test: "" })}
              className="caps step h-11 text-15 text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink"
            >
              Clear search and test
            </button>
          ) : null}
        </div>
      </div>

      {/* Quiz yourself on exactly what the filters above show. */}
      <section aria-labelledby={`${id}-quiz`} className="grid gap-3 border-[3px] border-ink p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={`${id}-quiz`} className="font-display text-[clamp(1.4rem,5vw,1.8rem)] leading-none font-bold uppercase">
            Quiz yourself on these
          </h2>
          <p className="num text-15 text-ink-2">
            {formatCount(quizable)} {quizable === 1 ? "question" : "questions"}
          </p>
        </div>
        {quizable ? (
          <div className="grid grid-cols-3 gap-2">
            <QuizLink href={`/career/quiz?${query}&size=quick`}>Quick quiz</QuizLink>
            <QuizLink href={`/career/quiz?${query}&size=complete`}>Full quiz</QuizLink>
            <QuizLink href={`/career/flashcards?${query}`}>Flashcards</QuizLink>
          </div>
        ) : (
          <p className="text-16 text-ink-2">
            Nothing here to quiz: widen the filters, or answer a few more questions. Questions whose answers your
            trainer hides aren&apos;t included.
          </p>
        )}
      </section>

      {groups.length ? (
        <div className="grid gap-8">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`${id}-${group.key}`} className="grid gap-3">
              <h3
                id={`${id}-${group.key}`}
                className="flex items-baseline justify-between gap-3 border-b-[3px] border-ink pb-1.5 font-display text-[clamp(1.4rem,5vw,1.8rem)] leading-none font-bold uppercase"
              >
                {group.label}
                <span className="num caps font-sans text-15 font-normal text-ink-2">
                  {formatCount(group.items.length)}
                </span>
              </h3>
              <ol className="grid gap-3">
                {group.items.map((item, i) => (
                  <CareerCard
                    key={`${item.answered_at}-${item.question_id ?? i}`}
                    item={item}
                    star={
                      starsWork && item.question_id ? (
                        <FavoriteStar
                          questionId={item.question_id}
                          initial={favorites.has(item.question_id)}
                          onChange={onStar}
                        />
                      ) : null
                    }
                  />
                ))}
              </ol>
            </section>
          ))}
          {shown.length > limit ? (
            <button
              type="button"
              onClick={() => setLimit((n) => n + CAREER_PAGE)}
              className="caps step h-12 w-full border-2 border-ink text-17 text-ink hover:bg-band"
            >
              Show {formatCount(Math.min(CAREER_PAGE, shown.length - limit))} more
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2 border-2 border-rule-strong px-4 py-8">
          <p className="font-display text-[clamp(1.6rem,6vw,2.2rem)] leading-none font-semibold uppercase">
            {rows.length ? "Nothing in this filter" : "No questions answered yet"}
          </p>
          <p className="text-17 text-ink-2">
            {filter === "favorites"
              ? "Tap the star on any question to keep it here."
              : rows.length
                ? "Try another word, test or filter above."
                : "Practise a test and every answer shows up here."}
          </p>
        </div>
      )}
    </div>
  );
}

function QuizLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="caps step press grid min-h-12 place-items-center border-2 border-ink px-1 text-center text-14 hover:bg-band sm:text-16"
    >
      {children}
    </Link>
  );
}

function CareerCard({ item, star }: { item: CareerItemRow; star: ReactNode }) {
  const tone =
    item.is_correct === null ? "border-l-rule-strong" : item.is_correct ? "border-l-ok" : "border-l-danger";
  return (
    <li className={`grid gap-2 border border-l-[6px] border-rule-strong bg-ground p-3 sm:p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-15 text-ink-2">
          {item.is_correct === null ? (
            <span className="caps text-16">Answers hidden</span>
          ) : (
            <span className={`caps text-16 font-semibold ${item.is_correct ? "text-ok" : "text-danger"}`}>
              {item.is_correct ? "Right" : "Wrong"}
            </span>
          )}
          <span className="[overflow-wrap:anywhere]">{item.test_title}</span>
          <span className="num">{formatTime(item.answered_at)}</span>
        </p>
        {star}
      </div>
      <p className="text-18 leading-snug whitespace-pre-line">{item.prompt}</p>
      <p className="text-16">
        <span className="text-ink-2">Picked: </span>
        {item.options[item.selected_index]}
      </p>
      {item.is_correct !== false || item.correct_index === null ? null : (
        <p className="text-16">
          <span className="text-ink-2">Right answer: </span>
          {item.options[item.correct_index]}
        </p>
      )}
      {item.explanation ? <p className="text-16 text-ink-2">{item.explanation}</p> : null}
    </li>
  );
}
