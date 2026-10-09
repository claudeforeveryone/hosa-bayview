// Pure helpers for activity, Elo, leaderboards and the honor roll. No database or server imports, so they test directly.
// The numbers themselves come from migrations 0017 and 0030; this file only ranks, filters and formats them.

export const PERIODS = ["today", "week", "month", "all"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  all: "All time",
};

export const METRICS = [
  "hours",
  "reviews",
  "answered",
  "accuracy",
  "elo",
] as const;
export type Metric = (typeof METRICS)[number];
export const METRIC_LABEL: Record<Metric, string> = {
  hours: "Hours",
  reviews: "Flashcards",
  answered: "Questions",
  accuracy: "Accuracy",
  elo: "Elo",
};

export const RESULTS = ["all", "right", "wrong"] as const;
export type Result = (typeof RESULTS)[number];

// What the Elo score is made of. Shown under the club board so the number isn't a mystery.
export const ELO_SUMMARY =
  "Everyone starts at 1200. Gain 0.5 a minute studied, 1 a flashcard, 2 a question and 3 more when it's right. Each card or question counts once a day. Each day you sign in adds 5. A study streak boosts study gains, up to 1.6× at 30 days.";

export type BoardRow = {
  user_id: string;
  full_name: string;
  minutes: number;
  reviews: number;
  answered: number;
  correct: number;
  accuracy: number | null;
  elo: number; // all-time Elo
  gain: number; // Elo earned inside the chosen period
  streak: number;
  avatar_url?: string | null;
};

export type RankedRow = BoardRow & {
  value: number | null;
  place: number | null;
};

export type OnlineRow = {
  user_id: string;
  full_name: string;
  last_seen: string;
};

export type HonorRow = { user_id: string; full_name: string; streak: number };

// Sign-in streak needed to be on the honor roll (days in a row).
export const HONOR_MIN_STREAK = 3;

const TORONTO = "America/Toronto";
const DAY_MS = 86_400_000;

// Accepts a search param of unknown shape (string, array or missing) and falls back to a default.
function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export const parsePeriod = (value: unknown): Period =>
  pick(value, PERIODS, "week");
export const parseMetric = (value: unknown): Metric =>
  pick(value, METRICS, "hours");
export const parseResult = (value: unknown): Result =>
  pick(value, RESULTS, "all");

// The Elo measure shows the period's gain, and the all-time total only for "all time".
export function metricValue(
  row: BoardRow,
  metric: Metric,
  period: Period,
): number | null {
  switch (metric) {
    case "hours":
      return row.minutes / 60;
    case "reviews":
      return row.reviews;
    case "answered":
      return row.answered;
    case "accuracy":
      return row.accuracy;
    case "elo":
      return period === "all" ? row.elo : row.gain;
  }
}

// Everyone in the chapter is listed, including people with nothing yet. Highest first; nulls (accuracy with no answers) last. Ties share a place (1, 1, 3).
// Ties on the metric break by questions answered, then name.
export function rankBoard(
  rows: BoardRow[],
  metric: Metric,
  period: Period,
): RankedRow[] {
  const sorted = [...rows].sort((a, b) => {
    const av = metricValue(a, metric, period);
    const bv = metricValue(b, metric, period);
    if (av === null || bv === null) {
      if (av === bv) return a.full_name.localeCompare(b.full_name);
      return av === null ? 1 : -1;
    }
    if (av !== bv) return bv - av;
    if (a.answered !== b.answered) return b.answered - a.answered;
    return a.full_name.localeCompare(b.full_name);
  });

  let place: number | null = null;
  let previous: number | null = null;
  return sorted.map((row, index) => {
    const value = metricValue(row, metric, period);
    if (value === null) return { ...row, value, place: null };
    if (previous === null || value !== previous) place = index + 1;
    previous = value;
    return { ...row, value, place };
  });
}

const count = new Intl.NumberFormat("en-CA");

export const formatCount = (n: number) => count.format(Math.round(n));
export const formatHours = (minutes: number) => (minutes / 60).toFixed(1);
export const formatPercent = (accuracy: number | null) =>
  accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`;
export const formatStreak = (days: number) =>
  days <= 0 ? "None" : days === 1 ? "1 day" : `${days} days`;

// Milestone label for an honor roll row, or null below the first milestone. Plain text, no icons.
export function awardFor(streak: number): string | null {
  if (streak >= 100) return "100-day";
  if (streak >= 30) return "30-day";
  if (streak >= 7) return "7-day";
  return null;
}

export function formatValue(
  value: number | null,
  metric: Metric,
  period: Period = "all",
): string {
  if (value === null) return "—";
  if (metric === "hours") return value.toFixed(1);
  if (metric === "accuracy") return formatPercent(value);
  if (metric === "elo" && period !== "all")
    return value > 0 ? `+${formatCount(value)}` : formatCount(value);
  return formatCount(value);
}

// The Toronto calendar day for an instant, as numbers, so the period math isn't at the mercy of the server's zone.
function torontoDay(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const read = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

// First day of the period as a Toronto calendar date: today, Monday for the week, the 1st for the month.
// Null for all time. Matches date_trunc('day' | 'week' | 'month') in migration 0030.
export function periodStart(period: Period, now: Date): Date | null {
  if (period === "all") return null;
  const { year, month, day } = torontoDay(now);
  if (period === "month") return new Date(Date.UTC(year, month - 1, 1));
  const today = Date.UTC(year, month - 1, day);
  if (period === "today") return new Date(today);
  const sinceMonday = (new Date(today).getUTCDay() + 6) % 7;
  return new Date(today - sinceMonday * DAY_MS);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "Mon 5 Oct" for captions, or null for all time. Fixed names so the text doesn't depend on ICU data.
export function periodSince(period: Period, now: Date): string | null {
  const start = periodStart(period, now);
  if (!start) return null;
  return `${WEEKDAYS[start.getUTCDay()]} ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`;
}

// Case-insensitive name search. An empty query returns everyone.
export function filterMembers<T extends { full_name: string }>(
  rows: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.full_name.toLowerCase().includes(q)) : rows;
}

export type CareerItem = { is_correct: boolean };
export function filterCareer<T extends CareerItem>(
  rows: T[],
  result: Result,
): T[] {
  if (result === "right") return rows.filter((r) => r.is_correct);
  if (result === "wrong") return rows.filter((r) => !r.is_correct);
  return rows;
}

// The classroom id in a /c/<uuid>/... path, or null for anywhere else.
const CLASSROOM_PATH =
  /^\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
export function classroomIdFromPath(path: string): string | null {
  return CLASSROOM_PATH.exec(path)?.[1] ?? null;
}
