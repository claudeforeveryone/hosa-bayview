import { MapPin } from "lucide-react";
import type { EventRow } from "@/lib/events";
import { TORONTO, dayKey, formatTime } from "@/lib/when";

// The tear-off date: weekday and month in caps around a big day number.
export function DateStub({
  iso,
  tone = "ink",
}: {
  iso: string;
  tone?: "ink" | "field";
}) {
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: TORONTO, ...o });
  return (
    <span
      className={`grid w-16 shrink-0 justify-items-center border py-1.5 leading-none sm:w-[4.5rem] ${
        tone === "field"
          ? "border-on-field-2/60 text-on-field"
          : "border-rule-strong text-ink"
      }`}
    >
      <span className="caps text-12 tracking-[0.12em]">
        {part({ weekday: "short" }).replace(".", "")}
      </span>
      <span className="num font-display text-34 font-bold sm:text-38">
        {part({ day: "numeric" })}
      </span>
      <span className="caps text-12 tracking-[0.12em]">
        {part({ month: "short" }).replace(".", "")}
      </span>
    </span>
  );
}

// "6:30 p.m. – 8 p.m." on one day; the end date too when it runs past midnight.
export function timeRange(e: Pick<EventRow, "starts_at" | "ends_at" | "all_day">): string {
  if (e.all_day) {
    if (!e.ends_at || dayKey(e.ends_at) === dayKey(e.starts_at)) return "All day";
    const until = new Date(e.ends_at).toLocaleDateString("en-CA", { timeZone: TORONTO, month: "short", day: "numeric" });
    return `All day, through ${until}`;
  }
  const start = formatTime(e.starts_at);
  if (!e.ends_at) return start;
  if (dayKey(e.ends_at) !== dayKey(e.starts_at)) {
    const endDay = new Date(e.ends_at).toLocaleDateString("en-CA", {
      timeZone: TORONTO,
      month: "short",
      day: "numeric",
    });
    return `${start} to ${endDay}, ${formatTime(e.ends_at)}`;
  }
  return `${start} to ${formatTime(e.ends_at)}`;
}

// Title, time, who it's for and where. `compact` drops the details for Home.
export function EventSummary({
  e,
  compact = false,
}: {
  e: EventRow;
  compact?: boolean;
}) {
  const scope = e.owner_id ? "Just you" : e.classroom_id ? (e.room?.name ?? "Event") : "Chapter";
  return (
    <span className="grid min-w-0 gap-1">
      <span className="caps num flex flex-wrap items-center gap-x-2 text-14 text-ink-2">
        <span>{timeRange(e)}</span>
        <span aria-hidden>·</span>
        <span className={e.classroom_id || e.owner_id ? "" : "text-you-line"}>{scope}</span>
      </span>
      <span className="font-display text-[clamp(1.45rem,5vw,1.9rem)] leading-[1.05] font-semibold [overflow-wrap:anywhere] uppercase">
        {e.title}
      </span>
      {e.location ? (
        <span className="flex items-center gap-1.5 text-16 text-ink-2">
          <MapPin
            size={16}
            strokeWidth={1.75}
            aria-hidden
            className="shrink-0"
          />
          <span className="truncate">{e.location}</span>
        </span>
      ) : null}
      {!compact && e.details ? (
        <span className="max-w-[65ch] text-16 whitespace-pre-line [overflow-wrap:anywhere]">
          {e.details}
        </span>
      ) : null}
    </span>
  );
}
