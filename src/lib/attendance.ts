// Pure attendance helpers: statuses, weeks, rates, exceptions. Safe on client and server.
// Weeks start on Monday and are named by that Monday's date (YYYY-MM-DD). The chapter runs on Toronto time.

export const STATUSES = ["present", "late", "absent", "excused"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

export const isStatus = (v: unknown): v is Status =>
  typeof v === "string" && (STATUSES as readonly string[]).includes(v);

// One tap moves a member through: unmarked -> present -> late -> absent -> excused -> unmarked.
export function nextStatus(current: Status | null): Status | null {
  const i = current === null ? -1 : STATUSES.indexOf(current);
  return i === STATUSES.length - 1 ? null : STATUSES[i + 1];
}

export type Counts = Record<Status, number>;

export function emptyCounts(): Counts {
  return { present: 0, late: 0, absent: 0, excused: 0 };
}

export function countStatuses(statuses: Status[]): Counts {
  const c = emptyCounts();
  for (const s of statuses) c[s] += 1;
  return c;
}

// Attended = present or late. Counted = attended plus absent. Excused is left out of the rate.
export function attendanceRate(c: Counts): {
  attended: number;
  counted: number;
  rate: number | null;
} {
  const attended = c.present + c.late;
  const counted = attended + c.absent;
  return {
    attended,
    counted,
    rate: counted ? Math.round((attended / counted) * 100) : null,
  };
}

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Real calendar dates only: 2026-02-30 is rejected.
export function isIsoDate(s: string): boolean {
  if (!DATE_PATTERN.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Today in Toronto, as YYYY-MM-DD (the chapter's time zone).
export function torontoToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

// Calendar arithmetic on YYYY-MM-DD strings. UTC math is exact for dates with no time of day.
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The Monday on or before an ISO date (Sunday belongs to the week that started six days earlier).
export function weekStartOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // Sun = 0
  return addDays(iso, -((day + 6) % 7));
}

export function isWeekStart(s: string): boolean {
  return isIsoDate(s) && weekStartOf(s) === s;
}

export function currentWeek(now: Date = new Date()): string {
  return weekStartOf(torontoToday(now));
}

// The Monday weeks counting back from `from` (inclusive), newest first, stopping at `floor` if given.
export function recentWeeks(
  from: string,
  count: number,
  floor?: string,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const w = addDays(from, -7 * i);
    if (floor && w < floor) break;
    out.push(w);
  }
  return out;
}

// "Week of Mon Oct 5"
export function weekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  const wd = d.toLocaleDateString("en-CA", {
    timeZone: "UTC",
    weekday: "short",
  });
  const md = d.toLocaleDateString("en-CA", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  return `Week of ${wd} ${md}`;
}

// "Oct 5, 7:14 p.m." in Toronto time, for submitted and edited stamps.
export function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// PostgREST returns at most 1000 rows per request. Read the rest page by page.
export const PAGE_SIZE = 1000;
export type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Page<T>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

export type MarkRow = { session_id: string; user_id: string; status: Status };

// Participation across classrooms. One counted entry is one member's mark in one classroom-week.
export type Participation = {
  user_id: string;
  counts: Counts;
  attended: number;
  counted: number;
  rate: number | null;
  flag: Flag;
};

// "perfect": every counted week attended. "check-in": under half attended. Both need MIN_COUNTED weeks.
export type Flag = "perfect" | "check-in" | null;
export const MIN_COUNTED = 4;

export function flagFor(attended: number, counted: number): Flag {
  if (counted < MIN_COUNTED) return null;
  if (attended === counted) return "perfect";
  if (attended / counted < 0.5) return "check-in";
  return null;
}

export function summarizeMembers(
  marks: Pick<MarkRow, "user_id" | "status">[],
): Participation[] {
  const byMember = new Map<string, Status[]>();
  for (const m of marks)
    byMember.set(m.user_id, [...(byMember.get(m.user_id) ?? []), m.status]);
  return [...byMember.entries()].map(([user_id, statuses]) => {
    const counts = countStatuses(statuses);
    const r = attendanceRate(counts);
    return { user_id, counts, ...r, flag: flagFor(r.attended, r.counted) };
  });
}

// Lowest rate first (the ones to check on), members with no counted weeks last, then by name.
export function compareParticipation(
  a: { rate: number | null; counted: number; name: string },
  b: { rate: number | null; counted: number; name: string },
): number {
  if (a.rate === null && b.rate !== null) return 1;
  if (a.rate !== null && b.rate === null) return -1;
  if (a.rate !== null && b.rate !== null && a.rate !== b.rate)
    return a.rate - b.rate;
  if (a.counted !== b.counted) return b.counted - a.counted;
  return a.name.localeCompare(b.name);
}
