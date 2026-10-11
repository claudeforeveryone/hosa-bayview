// Pure helpers for the career page: filter, sort, day groups and paging. Safe on client and server.
import { TORONTO, dayKey } from "@/lib/when";

export const CAREER_FILTERS = ["all", "right", "wrong", "favorites"] as const;
export type CareerFilter = (typeof CAREER_FILTERS)[number];
export const CAREER_SORTS = ["newest", "oldest"] as const;
export type CareerSort = (typeof CAREER_SORTS)[number];

export const CAREER_FILTER_LABEL: Record<CareerFilter, string> = {
  all: "All",
  right: "Right",
  wrong: "Wrong",
  favorites: "Favourites",
};
export const CAREER_SORT_LABEL: Record<CareerSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
};

// How many answers show before "Show more".
export const CAREER_PAGE = 25;

export type CareerEntry = {
  answered_at: string;
  is_correct: boolean | null;
  question_id: string | null;
};

export function parseCareerFilter(value: unknown): CareerFilter {
  // "result" links from before the career page used the same words.
  return CAREER_FILTERS.find((f) => f === value) ?? "all";
}

export function parseCareerSort(value: unknown): CareerSort {
  return CAREER_SORTS.find((s) => s === value) ?? "newest";
}

// One row per question: the newest answer. Stars are per question, so the favourites list shows each starred
// question once, and the count, the tile and the list all agree.
export function latestPerQuestion<T extends CareerEntry>(rows: T[]): T[] {
  const newest = new Map<string, T>();
  for (const r of rows) {
    if (r.question_id === null) continue;
    const seen = newest.get(r.question_id);
    if (!seen || Date.parse(r.answered_at) > Date.parse(seen.answered_at)) newest.set(r.question_id, r);
  }
  return [...newest.values()];
}

// The question ids you've starred, from the rows the career page loads.
export function starredIds(rows: { question_id: string | null; favorite: boolean }[]): Set<string> {
  return new Set(rows.filter((r) => r.favorite && r.question_id).map((r) => r.question_id as string));
}

export function filterEntries<T extends CareerEntry>(
  rows: T[],
  filter: CareerFilter,
  favorites: ReadonlySet<string>,
): T[] {
  switch (filter) {
    case "right":
      return rows.filter((r) => r.is_correct === true);
    case "wrong":
      return rows.filter((r) => r.is_correct === false);
    case "favorites":
      return latestPerQuestion(rows.filter((r) => r.question_id !== null && favorites.has(r.question_id)));
    default:
      return rows;
  }
}

export function sortEntries<T extends CareerEntry>(rows: T[], sort: CareerSort): T[] {
  const dir = sort === "newest" ? -1 : 1;
  return [...rows].sort((a, b) => dir * (Date.parse(a.answered_at) - Date.parse(b.answered_at)));
}

export function careerCounts<T extends CareerEntry>(
  rows: T[],
  favorites: ReadonlySet<string>,
): Record<CareerFilter, number> {
  return {
    all: rows.length,
    right: rows.filter((r) => r.is_correct === true).length,
    wrong: rows.filter((r) => r.is_correct === false).length,
    favorites: filterEntries(rows, "favorites", favorites).length,
  };
}

// Narrowing past right/wrong: one test (by title, "" for every test) and a search over the question, its options,
// the explanation and the test title. Case and accents don't matter; every word typed has to appear somewhere.
export type CareerScope = { test: string; q: string };
export const NO_SCOPE: CareerScope = { test: "", q: "" };

type Searchable = CareerEntry & {
  test_title: string;
  prompt: string;
  options: string[];
  explanation: string | null;
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function parseCareerScope(sp: { test?: unknown; q?: unknown }): CareerScope {
  const one = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
  return { test: one(sp.test), q: one(sp.q) };
}

export function scopeEntries<T extends Searchable>(rows: T[], scope: CareerScope): T[] {
  const words = fold(scope.q).split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (scope.test && r.test_title !== scope.test) return false;
    if (!words.length) return true;
    const hay = fold([r.prompt, r.test_title, r.explanation ?? "", ...r.options].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

// Each test you've answered from, with how many answers came from it, most answered first then A to Z.
export function careerTests<T extends { test_title: string }>(rows: T[]): { title: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.test_title, (counts.get(r.test_title) ?? 0) + 1);
  return [...counts]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

// The URL query that carries a set and a scope to the quiz and flashcard pages (and back).
export function careerQuery(set: CareerFilter, scope: CareerScope, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ set });
  if (scope.test) params.set("test", scope.test);
  if (scope.q) params.set("q", scope.q);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}

// The day before a "YYYY-MM-DD" key.
function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

// "Today", "Yesterday", "Mon Oct 6", or "Mon Oct 6, 2025" outside the current year. Days are Toronto days.
export function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  if (key === previousDay(todayKey)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  // Noon UTC is the same calendar day in Toronto, so formatting in Toronto can't shift it.
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = date.toLocaleDateString("en-US", { timeZone: TORONTO, weekday: "short" });
  const month = date.toLocaleDateString("en-US", { timeZone: TORONTO, month: "short" });
  const base = `${weekday} ${month} ${d}`;
  return key.slice(0, 4) === todayKey.slice(0, 4) ? base : `${base}, ${y}`;
}

export type DayGroup<T> = { key: string; label: string; items: T[] };

// Consecutive rows on the same Toronto day, in the order given.
export function groupByDay<T extends CareerEntry>(rows: T[], now: Date = new Date()): DayGroup<T>[] {
  const today = dayKey(now.toISOString());
  const groups: DayGroup<T>[] = [];
  for (const row of rows) {
    const key = dayKey(row.answered_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(row);
    else groups.push({ key, label: dayLabel(key, today), items: [row] });
  }
  return groups;
}
