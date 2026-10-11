// Pure helpers for the weekly attendance tracker (roster_members, roster_weeks, roster_marks; migration 0103).
// A "key" is one cell of the sheet: a roster row and a meeting date.

export type RosterWeek = { id: string; meet_on: string };

export const markKey = (memberId: string, weekId: string) =>
  `${memberId}|${weekId}`;

// "Oct 15" for a YYYY-MM-DD meeting date. UTC so the date never shifts.
export function weekColumnLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

// "Thu Oct 15" for the week picker.
export function weekLongLabel(iso: string): string {
  const wd = new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", {
    timeZone: "UTC",
    weekday: "short",
  });
  return `${wd} ${weekColumnLabel(iso)}`;
}

// The column to highlight: today's meeting, else the next one, else the last one. -1 when there are none.
// weeks must be sorted by date.
export function currentWeekIndex(
  weeks: readonly RosterWeek[],
  today: string,
): number {
  if (weeks.length === 0) return -1;
  const i = weeks.findIndex((w) => w.meet_on >= today);
  return i === -1 ? weeks.length - 1 : i;
}

// The week a page shows: the one asked for by date if it exists, otherwise the current one.
export function pickWeekIndex(
  weeks: readonly RosterWeek[],
  asked: string | undefined,
  today: string,
): number {
  if (asked) {
    const i = weeks.findIndex((w) => w.meet_on === asked);
    if (i !== -1) return i;
  }
  return currentWeekIndex(weeks, today);
}

// Present cells only; a missing or unticked mark is "not present".
export function presentKeys(
  marks: readonly { member_id: string; week_id: string; present: boolean }[],
): Set<string> {
  const out = new Set<string>();
  for (const m of marks)
    if (m.present) out.add(markKey(m.member_id, m.week_id));
  return out;
}

// How many weeks one person was present.
export function rowTotal(
  present: ReadonlySet<string>,
  memberId: string,
  weekIds: readonly string[],
): number {
  let n = 0;
  for (const w of weekIds) if (present.has(markKey(memberId, w))) n++;
  return n;
}

// How many people were present one week.
export function columnTotal(
  present: ReadonlySet<string>,
  memberIds: readonly string[],
  weekId: string,
): number {
  let n = 0;
  for (const m of memberIds) if (present.has(markKey(m, weekId))) n++;
  return n;
}

// "FS · Forensic Science", or just the name when the class has no code yet.
export function classLabel(
  code: string | null | undefined,
  name: string,
): string {
  return code ? `${code} · ${name}` : name;
}

export const SHORT_CODE = /^[A-Z]{2,4}$/;

// Typed codes are trimmed and upper-cased; "" clears the code. null means not a valid code.
export function normalizeShortCode(raw: string): string | null | "" {
  const s = raw.trim().toUpperCase();
  if (s === "") return "";
  return SHORT_CODE.test(s) ? s : null;
}

// Names are stored trimmed with single spaces.
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
