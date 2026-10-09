// Chapter time is Toronto time. Pure helpers for date-time inputs and display; safe on client and server.

export const TORONTO = "America/Toronto";

// Toronto's offset from UTC in minutes at that instant (-240 in summer, -300 in winter).
function offsetAt(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

// "2026-10-14T18:30" typed in Toronto -> ISO instant. Null for anything that isn't a real date-time.
export function torontoToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  if (new Date(guess).getUTCDate() !== d) return null;
  // Two passes settle the offset across a DST change.
  let ms = guess - offsetAt(guess) * 60000;
  ms = guess - offsetAt(ms) * 60000;
  const iso = new Date(ms).toISOString();
  // The hour skipped when clocks spring forward doesn't exist; refuse it rather than shift it.
  return isoToToronto(iso) === local.trim() ? iso : null;
}

// ISO instant -> "2026-10-14T18:30" in Toronto, for an <input type="datetime-local"> default.
export function isoToToronto(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const local = new Date(ms + offsetAt(ms) * 60000);
  return local.toISOString().slice(0, 16);
}

// "Wed Oct 14, 6:30 p.m."
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: TORONTO,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "6:30 p.m."
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", {
    timeZone: TORONTO,
    hour: "numeric",
    minute: "2-digit",
  });
}

// Toronto calendar day, "2026-10-14", for grouping.
export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TORONTO });
}

// "Wednesday, October 14"
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: TORONTO,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// "5m ago", "3h ago", "2d ago", then a date.
export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: TORONTO,
    month: "short",
    day: "numeric",
  });
}
