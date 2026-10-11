"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import {
  formatCount,
  formatHours,
  formatPercent,
  PERIOD_LABEL,
  type Period,
} from "@/lib/activity";
import {
  accuracyOf,
  searchDevRows,
  sortDevRows,
  summarizeDev,
  summaryText,
  type DevSortKey,
  type DevStatsRow,
  type SortDir,
} from "@/lib/dev-stats";
import { roleLabel } from "@/lib/role-label";

type Column = {
  key: DevSortKey;
  label: string;
  group: string;
  numeric: boolean;
  cell: (r: DevStatsRow) => ReactNode;
};

const seenFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  dateStyle: "medium",
  timeStyle: "short",
});
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  dateStyle: "medium",
});

const hours = (minutes: number) => formatHours(minutes);
const count = (n: number) => formatCount(n);

const COLUMNS: Column[] = [
  {
    key: "name",
    label: "Name",
    group: "Member",
    numeric: false,
    cell: (r) => (
      <span className="grid gap-0.5">
        <span className="font-display text-[20px] leading-tight font-semibold uppercase">
          {r.full_name || "Member"}
        </span>
        {r.banned ? (
          <span className="caps w-max bg-you px-1.5 py-0.5 text-[12px] leading-none text-on-you">
            Banned
          </span>
        ) : null}
      </span>
    ),
  },
  {
    key: "role",
    label: "Role",
    group: "Member",
    numeric: false,
    cell: (r) => roleLabel(r.role, r.title),
  },
  {
    key: "joined",
    label: "Joined",
    group: "Member",
    numeric: false,
    cell: (r) => dayFormat.format(new Date(r.joined_at)),
  },
  {
    key: "last_seen",
    label: "Last seen",
    group: "Member",
    numeric: false,
    cell: (r) =>
      r.last_seen ? seenFormat.format(new Date(r.last_seen)) : "Never",
  },
  {
    key: "minutes_all",
    label: "All time",
    group: "Time on site (hours)",
    numeric: true,
    cell: (r) => hours(r.minutes_all),
  },
  {
    key: "minutes_7d",
    label: "7 days",
    group: "Time on site (hours)",
    numeric: true,
    cell: (r) => hours(r.minutes_7d),
  },
  {
    key: "minutes_today",
    label: "Today",
    group: "Time on site (hours)",
    numeric: true,
    cell: (r) => hours(r.minutes_today),
  },
  {
    key: "clicks_all",
    label: "All time",
    group: "Clicks",
    numeric: true,
    cell: (r) => count(r.clicks_all),
  },
  {
    key: "clicks_7d",
    label: "7 days",
    group: "Clicks",
    numeric: true,
    cell: (r) => count(r.clicks_7d),
  },
  {
    key: "clicks_today",
    label: "Today",
    group: "Clicks",
    numeric: true,
    cell: (r) => count(r.clicks_today),
  },
  {
    key: "answered",
    label: "Questions",
    group: "Chosen period",
    numeric: true,
    cell: (r) => count(r.answered),
  },
  {
    key: "correct",
    label: "Correct",
    group: "Chosen period",
    numeric: true,
    cell: (r) => count(r.correct),
  },
  {
    key: "accuracy",
    label: "Accuracy",
    group: "Chosen period",
    numeric: true,
    cell: (r) => formatPercent(accuracyOf(r.correct, r.answered)),
  },
  {
    key: "attempts",
    label: "Tests",
    group: "Chosen period",
    numeric: true,
    cell: (r) => count(r.attempts),
  },
  {
    key: "finished",
    label: "Finished",
    group: "Chosen period",
    numeric: true,
    cell: (r) => count(r.finished),
  },
  {
    key: "reviews",
    label: "Flashcards",
    group: "Chosen period",
    numeric: true,
    cell: (r) => count(r.reviews),
  },
  {
    key: "battle_wins",
    label: "Battles won",
    group: "Chosen period",
    numeric: true,
    cell: (r) => count(r.battle_wins),
  },
  {
    key: "elo_gain",
    label: "Elo gain",
    group: "Chosen period",
    numeric: true,
    cell: (r) => count(r.elo_gain),
  },
  {
    key: "classrooms",
    label: "Events",
    group: "All time",
    numeric: true,
    cell: (r) => count(r.classrooms),
  },
  {
    key: "elo",
    label: "Elo",
    group: "All time",
    numeric: true,
    cell: (r) => count(r.elo),
  },
];

const TEXT_KEYS: DevSortKey[] = ["name", "role", "joined", "last_seen"];

// Phone sort menu: every column, named the way people read it.
const sortOptions = (columns: Column[]) =>
  columns.map((c) => ({
    key: c.key,
    text: `${c.group === "Member" ? "" : `${c.group}: `}${c.label}`,
  }));

// The groups above the table header, in column order, with how many columns each spans.
function groupsOf(columns: Column[]) {
  const out: { label: string; span: number }[] = [];
  for (const c of columns) {
    const last = out[out.length - 1];
    if (last && last.label === c.group) last.span += 1;
    else out.push({ label: c.group, span: 1 });
  }
  return out;
}

const dayTime = (iso: string | null) =>
  iso ? seenFormat.format(new Date(iso)) : "Never";

// `battles` is false while battles (0095) aren't on the database: the column would be a zero for everyone, which
// reads as a result. The owner console's Overview has the chapter-wide counts, so the strip here keeps only the
// period totals it can't show.
export function DevStatsView({
  rows,
  period,
  battles = true,
}: {
  rows: DevStatsRow[];
  period: Period;
  battles?: boolean;
}) {
  const columns = battles
    ? COLUMNS
    : COLUMNS.filter((c) => c.key !== "battle_wins");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<DevSortKey>("minutes_all");
  const [dir, setDir] = useState<SortDir>("desc");

  const summary = useMemo(() => summaryText(summarizeDev(rows)), [rows]);
  const shown = useMemo(
    () => sortDevRows(searchDevRows(rows, query), sortKey, dir),
    [rows, query, sortKey, dir],
  );

  const pick = (key: DevSortKey) => {
    if (key === sortKey) {
      setDir(dir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setDir(TEXT_KEYS.includes(key) ? "asc" : "desc");
  };

  const stats: { label: string; value: string }[] = [
    { label: `Hours, ${PERIOD_LABEL[period]}`, value: summary.hours },
    { label: `Questions, ${PERIOD_LABEL[period]}`, value: summary.questions },
    { label: `Clicks, ${PERIOD_LABEL[period]}`, value: summary.clicks },
  ];

  const groups = groupsOf(columns);
  const sortIcon = (key: DevSortKey) => {
    if (key !== sortKey) return <ChevronsUpDown size={15} aria-hidden />;
    return dir === "asc" ? (
      <ChevronUp size={15} aria-hidden />
    ) : (
      <ChevronDown size={15} aria-hidden />
    );
  };
  const ariaSort = (key: DevSortKey) =>
    key === sortKey ? (dir === "asc" ? "ascending" : "descending") : undefined;

  return (
    <div className="grid gap-6">
      <section
        aria-label="Chapter summary"
        className="grid grid-cols-3 border-t-[3px] border-ink"
      >
        {/* Numerals follow the width of the section around them (cqi), not the window's. */}
        {stats.map((s) => (
          <div key={s.label} className="border-b border-rule px-1 py-3 sm:px-3">
            <p className="caps text-[13px] leading-tight text-ink-2">
              {s.label}
            </p>
            <p className="num font-display mt-1 text-[clamp(2rem,6cqi,2.75rem)] leading-none font-bold">
              {s.value}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-1">
          <label htmlFor="dev-search" className="caps text-[14px] text-ink-2">
            Search by name
          </label>
          <input
            id="dev-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            className="step h-12 min-w-0 border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink"
          />
        </div>
        <div className="grid gap-1 lg:hidden">
          <label htmlFor="dev-sort" className="caps text-[14px] text-ink-2">
            Sort by
          </label>
          <div className="flex gap-2">
            <select
              id="dev-sort"
              value={sortKey}
              onChange={(e) => pick(e.target.value as DevSortKey)}
              className="step h-12 min-w-0 flex-1 border border-rule-strong bg-ground px-2 text-[16px] text-ink outline-none focus:border-ink"
            >
              {sortOptions(columns).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.text}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
              aria-label={`Sort ${dir === "asc" ? "ascending" : "descending"}; switch direction`}
              className="caps step inline-flex h-12 w-12 shrink-0 items-center justify-center border border-rule-strong text-ink hover:bg-band"
            >
              {dir === "asc" ? (
                <ChevronUp size={20} aria-hidden />
              ) : (
                <ChevronDown size={20} aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No members yet." />
      ) : shown.length === 0 ? (
        <p className="caps text-[16px] text-ink-2">No one matches that name.</p>
      ) : (
        <>
          {/* Phone: one stacked card per member. */}
          <ul
            className="border-t-[3px] border-ink lg:hidden"
            aria-label="Members"
          >
            {shown.map((r) => (
              <li
                key={r.user_id}
                className="grid gap-3 border-b border-rule py-4"
              >
                <div className="grid gap-0.5">
                  <p className="font-display text-[clamp(1.6rem,6vw,2.2rem)] leading-none font-semibold uppercase">
                    {r.full_name || "Member"}
                  </p>
                  <p className="caps text-[14px] text-ink-2">
                    {roleLabel(r.role, r.title)}
                    {r.banned ? " · Banned" : ""}
                  </p>
                  <p className="text-[14px] text-ink-2">
                    Last seen {dayTime(r.last_seen)} · Joined{" "}
                    {dayFormat.format(new Date(r.joined_at))}
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                  <MiniStat label="Time today" value={hours(r.minutes_today)} />
                  <MiniStat label="Time 7 days" value={hours(r.minutes_7d)} />
                  <MiniStat label="Time all" value={hours(r.minutes_all)} />
                  <MiniStat
                    label="Clicks today"
                    value={count(r.clicks_today)}
                  />
                  <MiniStat label="Clicks 7 days" value={count(r.clicks_7d)} />
                  <MiniStat label="Clicks all" value={count(r.clicks_all)} />
                  <MiniStat label="Questions" value={count(r.answered)} />
                  <MiniStat
                    label="Accuracy"
                    value={formatPercent(accuracyOf(r.correct, r.answered))}
                  />
                  <MiniStat label="Elo" value={count(r.elo)} />
                  <MiniStat
                    label="Tests"
                    value={`${count(r.attempts)} / ${count(r.finished)}`}
                  />
                  <MiniStat label="Flashcards" value={count(r.reviews)} />
                  {battles ? (
                    <MiniStat
                      label="Battles won"
                      value={count(r.battle_wins)}
                    />
                  ) : null}
                </dl>
                <p className="text-[13px] text-ink-2">
                  Figures under Questions, Accuracy, Tests and Flashcards follow
                  the chosen period. Events: {count(r.classrooms)}.
                </p>
              </li>
            ))}
          </ul>

          {/* Desktop: a sortable table. The name column stays put while the rest scrolls sideways. The scroller is
              flipped (and the table flipped back) so its scrollbar sits at the top, in view, not under the last row. */}
          <div className="hidden gap-2 lg:grid">
            <p className="text-[14px] text-ink-2">
              Wider than the page: scroll the table sideways. Names stay put.
            </p>
            <div className="overflow-x-auto border-b-[3px] border-ink [scrollbar-color:var(--ink-2)_var(--band)] [transform:rotateX(180deg)]">
              <table className="w-full min-w-[78rem] border-collapse text-[16px] [transform:rotateX(180deg)]">
                <caption className="sr-only">
                  Every member&rsquo;s activity for the chosen period. Click a
                  column heading to sort.
                </caption>
                <thead>
                  <tr>
                    {groups.map((g) => (
                      <th
                        key={g.label}
                        scope="colgroup"
                        colSpan={g.span}
                        className="caps border-b border-rule px-2 pt-2 pb-1 text-left text-[13px] font-semibold text-ink-2"
                      >
                        {g.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {columns.map((c, i) => (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={ariaSort(c.key)}
                        className={`border-b-[3px] border-ink px-2 pb-2 align-bottom ${
                          i === 0 ? "sticky left-0 z-10 bg-ground" : ""
                        } ${c.numeric ? "text-right" : "text-left"}`}
                      >
                        <button
                          type="button"
                          onClick={() => pick(c.key)}
                          className={`caps step inline-flex items-center gap-1 text-[15px] font-semibold text-ink hover:text-ink-2 ${
                            c.numeric ? "flex-row-reverse" : ""
                          }`}
                        >
                          {c.label}
                          {sortIcon(c.key)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr
                      key={r.user_id}
                      className="border-b border-rule hover:bg-band"
                    >
                      {columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={`px-2 py-2.5 ${c.numeric ? "num text-right" : "text-left"} ${
                            i === 0 ? "sticky left-0 z-10 bg-ground" : ""
                          } ${c.key === "name" ? "min-w-[12rem]" : ""} ${
                            c.key === "last_seen" || c.key === "joined"
                              ? "whitespace-nowrap"
                              : ""
                          }`}
                        >
                          {c.cell(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="caps text-[12px] leading-tight text-ink-2">{label}</dt>
      <dd className="num text-[17px] font-semibold">{value}</dd>
    </div>
  );
}
