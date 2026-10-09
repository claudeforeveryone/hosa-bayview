// Pure attendance helpers: status cycle, rates, summaries. Safe on client and server.

export const STATUSES = ["present", "late", "absent", "excused"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

export const isStatus = (v: unknown): v is Status => typeof v === "string" && (STATUSES as readonly string[]).includes(v);

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
export function attendanceRate(c: Counts): { attended: number; counted: number; rate: number | null } {
  const attended = c.present + c.late;
  const counted = attended + c.absent;
  return { attended, counted, rate: counted ? Math.round((attended / counted) * 100) : null };
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

export function formatSessionDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// PostgREST returns at most 1000 rows per request. Read the rest page by page.
export const PAGE_SIZE = 1000;
export type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Page<T>): Promise<T[]> {
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
export type SessionFact = { id: string; held_on: string; classroom_name: string };

// Admin overview: one row per session, one row per member (across all classrooms).
export function summarizeOverview(sessions: SessionFact[], marks: MarkRow[]) {
  const bySession = new Map<string, Status[]>();
  const byMember = new Map<string, Status[]>();
  for (const m of marks) {
    bySession.set(m.session_id, [...(bySession.get(m.session_id) ?? []), m.status]);
    byMember.set(m.user_id, [...(byMember.get(m.user_id) ?? []), m.status]);
  }
  const sessionRows = sessions.map((s) => {
    const counts = countStatuses(bySession.get(s.id) ?? []);
    const marked = STATUSES.reduce((n, k) => n + counts[k], 0);
    return { ...s, counts, marked };
  });
  const memberRows = [...byMember.entries()].map(([user_id, statuses]) => ({
    user_id,
    counts: countStatuses(statuses),
    ...attendanceRate(countStatuses(statuses)),
  }));
  return { sessionRows, memberRows };
}
