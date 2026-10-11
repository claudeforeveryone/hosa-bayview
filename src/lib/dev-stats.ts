// Pure helpers for the developer stats page (migration 0104): the row shape, the chapter summary, search and
// sort. No database or server imports, so they test directly. The numbers come from dev_member_stats.
import { filterMembers, formatCount, formatHours } from "./activity";
import type { Role } from "./auth";

export type DevStatsRow = {
  user_id: string;
  full_name: string;
  role: Role;
  title: string | null;
  joined_at: string;
  banned: boolean;
  last_seen: string | null;
  seen_today: boolean;
  seen_week: boolean;
  minutes_all: number;
  minutes_7d: number;
  minutes_today: number;
  minutes_period: number;
  clicks_all: number;
  clicks_7d: number;
  clicks_today: number;
  clicks_period: number;
  answered: number;
  correct: number;
  attempts: number;
  finished: number;
  reviews: number;
  battle_wins: number;
  classrooms: number;
  elo: number;
  elo_gain: number;
};

// Correct over answered, or null when nothing was answered in the period (so it sorts last, not as 0%).
export function accuracyOf(correct: number, answered: number): number | null {
  return answered > 0 ? correct / answered : null;
}

export type DevSummary = {
  members: number;
  activeToday: number;
  activeWeek: number;
  minutesPeriod: number;
  answeredPeriod: number;
  clicksPeriod: number;
};

// The strip above the table. Active today and this week count members seen on the site in that window; the
// rest follow the chosen period.
export function summarizeDev(rows: DevStatsRow[]): DevSummary {
  return rows.reduce<DevSummary>(
    (acc, r) => ({
      members: acc.members + 1,
      activeToday: acc.activeToday + (r.seen_today ? 1 : 0),
      activeWeek: acc.activeWeek + (r.seen_week ? 1 : 0),
      minutesPeriod: acc.minutesPeriod + r.minutes_period,
      answeredPeriod: acc.answeredPeriod + r.answered,
      clicksPeriod: acc.clicksPeriod + r.clicks_period,
    }),
    {
      members: 0,
      activeToday: 0,
      activeWeek: 0,
      minutesPeriod: 0,
      answeredPeriod: 0,
      clicksPeriod: 0,
    },
  );
}

// Summary figures as the strip prints them.
export function summaryText(s: DevSummary) {
  return {
    members: formatCount(s.members),
    activeToday: formatCount(s.activeToday),
    activeWeek: formatCount(s.activeWeek),
    hours: formatHours(s.minutesPeriod),
    questions: formatCount(s.answeredPeriod),
    clicks: formatCount(s.clicksPeriod),
  };
}

export const DEV_NUMERIC_KEYS = [
  "minutes_all",
  "minutes_7d",
  "minutes_today",
  "clicks_all",
  "clicks_7d",
  "clicks_today",
  "answered",
  "correct",
  "attempts",
  "finished",
  "reviews",
  "battle_wins",
  "classrooms",
  "elo",
  "elo_gain",
] as const;
export type DevNumericKey = (typeof DEV_NUMERIC_KEYS)[number];

export const DEV_SORT_KEYS = [
  "name",
  "role",
  "joined",
  "last_seen",
  "accuracy",
  ...DEV_NUMERIC_KEYS,
] as const;
export type DevSortKey = (typeof DEV_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

// The value a column sorts by. Null means "no value" (never seen, no answers); those rows sort last either way.
export function sortValue(
  row: DevStatsRow,
  key: DevSortKey,
): string | number | null {
  switch (key) {
    case "name":
      return row.full_name.toLowerCase();
    case "role":
      return row.role;
    case "joined":
      return Date.parse(row.joined_at);
    case "last_seen":
      return row.last_seen ? Date.parse(row.last_seen) : null;
    case "accuracy":
      return accuracyOf(row.correct, row.answered);
    default:
      return row[key as DevNumericKey];
  }
}

export function sortDevRows(
  rows: DevStatsRow[],
  key: DevSortKey,
  dir: SortDir,
): DevStatsRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null && va !== vb) {
      return (va < vb ? -1 : 1) * sign;
    }
    return (
      a.full_name.localeCompare(b.full_name) ||
      a.user_id.localeCompare(b.user_id)
    );
  });
}

// Case-insensitive name search; an empty query keeps everyone.
export function searchDevRows(
  rows: DevStatsRow[],
  query: string,
): DevStatsRow[] {
  return filterMembers(rows, query);
}

export function isDevSortKey(value: unknown): value is DevSortKey {
  return (
    typeof value === "string" &&
    (DEV_SORT_KEYS as readonly string[]).includes(value)
  );
}
