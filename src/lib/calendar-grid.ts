// Month-grid date math for the calendar. Pure: day keys are Toronto calendar days ("2026-10-14"), so the grid
// itself never touches time zones; only event instants are converted, through when.ts.
import { dayKey, isoToToronto, torontoToIso } from "@/lib/when";

export type Month = { year: number; month: number }; // month is 1 to 12
export type GridDay = { key: string; day: number; inMonth: boolean; weekday: number };

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// "2026-10-14" plus n days.
export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return keyOf(d);
}

// `?m=2026-10`. Anything else (missing, malformed, out of range) falls back to the month `todayKey` is in.
export function parseMonth(m: string | string[] | undefined, todayKey: string): Month {
  const raw = Array.isArray(m) ? m[0] : m;
  const hit = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (hit) {
    const year = Number(hit[1]);
    const month = Number(hit[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  const [year, month] = todayKey.split("-").map(Number);
  return { year, month };
}

export const monthParam = ({ year, month }: Month) => `${year}-${pad(month)}`;

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

// "October 2026"
export function monthLabel({ year, month }: Month): string {
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("en-CA", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

// Whole weeks, Sunday first, covering the month: 4 to 6 rows of 7.
export function gridDays({ year, month }: Month): GridDay[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysIn = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const total = Math.ceil((lead + daysIn) / 7) * 7;
  const start = keyOf(first);
  return Array.from({ length: total }, (_, i) => {
    const key = addDays(start, i - lead);
    const d = fromKey(key);
    return { key, day: d.getUTCDate(), inMonth: d.getUTCMonth() === month - 1, weekday: i % 7 };
  });
}

// The instants the grid spans: Toronto midnight on its first day to Toronto midnight after its last.
export function gridRange(days: GridDay[]): { from: string; to: string } {
  const first = days[0].key;
  const after = addDays(days[days.length - 1].key, 1);
  return {
    from: torontoToIso(`${first}T00:00`) ?? `${first}T05:00:00.000Z`,
    to: torontoToIso(`${after}T00:00`) ?? `${after}T05:00:00.000Z`,
  };
}

type Spannable = { starts_at: string; ends_at: string | null; all_day: boolean };

// Every Toronto day an event touches. All-day ends are inclusive dates; a timed event ending exactly at
// midnight doesn't spill onto the next day. Capped so a runaway end date can't flood the grid.
export function eventDayKeys(e: Spannable, maxDays = 62): string[] {
  const start = dayKey(e.starts_at);
  let end = start;
  if (e.ends_at && Date.parse(e.ends_at) > Date.parse(e.starts_at)) {
    end = dayKey(e.ends_at);
    if (!e.all_day && end > start && isoToToronto(e.ends_at).endsWith("T00:00")) end = addDays(end, -1);
  }
  const keys = [start];
  while (keys.length < maxDays && keys[keys.length - 1] < end) keys.push(addDays(keys[keys.length - 1], 1));
  return keys;
}

// Events per day key, only for days in `days`. All-day first, then by start time.
export function bucketByDay<T extends Spannable>(events: T[], days: GridDay[]): Record<string, T[]> {
  const wanted = new Set(days.map((d) => d.key));
  const out: Record<string, T[]> = {};
  const sorted = [...events].sort(
    (a, b) => Number(b.all_day) - Number(a.all_day) || Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  for (const e of sorted)
    for (const k of eventDayKeys(e)) if (wanted.has(k)) (out[k] ??= []).push(e);
  return out;
}

// Month grid or the agenda list. An explicit `?view=` wins, then a `?m=` month (a month link means the grid),
// then the last choice remembered on this device (cookie), then the grid.
export type CalendarView = "month" | "list";
export const CALENDAR_VIEW_COOKIE = "calview";

export function pickView(
  view: string | string[] | undefined,
  m: string | string[] | undefined,
  remembered: string | undefined,
): CalendarView {
  const v = Array.isArray(view) ? view[0] : view;
  if (v === "list" || v === "month") return v;
  if (m !== undefined) return "month";
  return remembered === "list" ? "list" : "month";
}

// Events grouped by the Toronto day they start on, keeping the incoming order (the agenda list).
export function groupByStartDay<T extends { starts_at: string }>(rows: T[]): { key: string; first: string; items: T[] }[] {
  const days: { key: string; first: string; items: T[] }[] = [];
  for (const e of rows) {
    const key = dayKey(e.starts_at);
    const last = days.at(-1);
    if (last?.key === key) last.items.push(e);
    else days.push({ key, first: e.starts_at, items: [e] });
  }
  return days;
}
