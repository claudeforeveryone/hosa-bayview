// Pure helpers for bans. No database or server imports, so they test directly.
// Dates are shown in Toronto time, like the rest of the app.

export const BAN_CHOICES = [
  "day",
  "week",
  "month",
  "custom",
  "permanent",
] as const;
export type BanChoice = (typeof BAN_CHOICES)[number];

export const BAN_LABEL: Record<BanChoice, string> = {
  day: "1 day",
  week: "1 week",
  month: "1 month",
  custom: "Until a date",
  permanent: "Permanently",
};

const TORONTO = "America/Toronto";
const DAY_MS = 86_400_000;

// Adds calendar months in UTC, clamping to the last day of the month (31 Jan + 1 month = 28 Feb).
export function addMonths(from: Date, months: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(from.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      y,
      m,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
    ),
  );
}

// Toronto's offset from UTC at an instant, in minutes (-300 in winter, -240 in summer).
function torontoOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const read = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

// "YYYY-MM-DD" to the calendar parts, or null when it isn't a real date.
function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  )
    return null;
  return { y, m, d };
}

// Midnight at the start of a Toronto calendar day, as an instant. ymd is "YYYY-MM-DD".
export function torontoMidnight(ymd: string): Date | null {
  const parts = parseYmd(ymd);
  if (!parts) return null;
  const naive = Date.UTC(parts.y, parts.m - 1, parts.d);
  // Two passes: the offset at the guessed instant can differ from the offset at the real one.
  const first = naive - torontoOffsetMinutes(new Date(naive)) * 60_000;
  return new Date(naive - torontoOffsetMinutes(new Date(first)) * 60_000);
}

// The ban end for a choice. "custom" runs through the end of the chosen Toronto day, so it ends at the
// next Toronto midnight. "permanent" is returned as itself. Null when the choice or the date isn't usable.
export function banUntil(
  choice: BanChoice,
  now: Date,
  customDay?: string,
): Date | "permanent" | null {
  switch (choice) {
    case "day":
      return new Date(now.getTime() + DAY_MS);
    case "week":
      return new Date(now.getTime() + 7 * DAY_MS);
    case "month":
      return addMonths(now, 1);
    case "permanent":
      return "permanent";
    case "custom": {
      const parts = customDay ? parseYmd(customDay) : null;
      if (!customDay || !parts) return null;
      const dayAfter = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + 1))
        .toISOString()
        .slice(0, 10);
      const end = torontoMidnight(dayAfter);
      return end && end > now ? end : null;
    }
  }
}

export type BanStatus =
  { banned: false } | { banned: true; permanent: boolean; until: Date | null };

// Whether a stored banned_until is in force at `now`. Accepts the ISO string PostgREST returns, or
// "infinity" for a permanent ban.
export function banStatus(bannedUntil: string | null, now: Date): BanStatus {
  if (!bannedUntil) return { banned: false };
  if (bannedUntil === "infinity")
    return { banned: true, permanent: true, until: null };
  const until = new Date(bannedUntil);
  if (Number.isNaN(until.getTime()) || until <= now) return { banned: false };
  return { banned: true, permanent: false, until };
}

const DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: TORONTO,
  year: "numeric",
  month: "short",
  day: "numeric",
});

// "until 12 Oct 2026" or "permanently", for the banned page and the admin list.
export function banWhen(status: {
  permanent: boolean;
  until: Date | null;
}): string {
  return status.permanent || !status.until
    ? "permanently"
    : `until ${DATE.format(status.until)}`;
}
