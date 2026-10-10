import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DateStub, EventSummary } from "@/components/event-item";
import type { EventRow } from "@/lib/events";
import { dayKey } from "@/lib/when";
import { groupBySection, sectionAnchors } from "@/lib/materials";

// The event page's middle: what to read (resources by section) and what to practise (tests, decks, skills).

export const hubHeading =
  "border-t-[3px] border-ink px-1 pt-3 font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase sm:px-3";

// One row per section with its count; each row opens its own section on the Resources tab.
export function HubResources({
  base,
  rows,
  canManage,
}: {
  base: string;
  rows: { section: string | null }[];
  canManage: boolean;
}) {
  const href = `${base}/resources`;
  const groups = groupBySection(rows);
  const anchors = sectionAnchors(groups.map((g) => g.section));
  return (
    <section aria-labelledby="hub-resources-h" className="grid gap-4">
      <h2 id="hub-resources-h" className={hubHeading}>
        Resources
      </h2>
      {groups.length ? (
        <ul className="border-t border-rule">
          {groups.map((g, i) => (
            <li key={g.section ?? "general"} className="border-b border-rule">
              <Link
                href={`${href}#${anchors[i]}`}
                className="step grid min-h-12 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-1 py-3 hover:bg-band sm:px-3"
              >
                <span className="caps text-[17px] font-semibold [overflow-wrap:anywhere]">
                  {g.section ?? "General"}
                </span>
                <span className="num text-[15px] text-ink-2">
                  {g.items.length}
                </span>
                <ChevronRight
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden
                  className="text-ink-2"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        // Solid rules, not the shared dashed empty state, to match the rest of the hub.
        <div className="grid justify-items-start gap-3 border-y border-rule px-1 py-6 sm:px-3">
          <p className="font-display text-[clamp(1.5rem,5vw,2rem)] leading-[1.05] font-semibold uppercase">
            No resources yet
          </p>
          {canManage ? (
            <Link
              href={href}
              className="caps step inline-flex h-11 items-center gap-2 border border-ink px-4 text-[16px] hover:bg-band"
            >
              Add a file or link
              <ChevronRight size={18} strokeWidth={2} aria-hidden />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

export type PracticeCell = {
  slug: string;
  label: string;
  count: number;
  extra?: string | null; // for managers: "3 drafts"
};

// Counts at poster scale, one cell per kind of practice, each a door to its tab, in one heavy frame.
export function PracticeStrip({
  base,
  cells,
}: {
  base: string;
  cells: PracticeCell[];
}) {
  return (
    <section aria-labelledby="hub-practice-h" className="grid gap-4">
      <h2 id="hub-practice-h" className={hubHeading}>
        Practice
      </h2>
      <ul
        className={`grid border-[3px] border-ink ${cells.length === 3 ? "grid-cols-3" : cells.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
      >
        {cells.map((c) => (
          <li key={c.slug} className="border-r-2 border-ink last:border-r-0">
            <Link
              href={`${base}/${c.slug}`}
              className="step grid h-full content-between gap-3 px-3 py-4 hover:bg-band sm:px-5 sm:py-5"
            >
              <span className="num font-display text-[clamp(2.75rem,11vw,4.5rem)] leading-[0.9] font-bold">
                {c.count}
              </span>
              <span className="grid gap-0.5">
                <span className="caps flex items-center gap-1 text-[16px] sm:text-[18px]">
                  {c.label}
                  <ChevronRight
                    size={18}
                    strokeWidth={2}
                    aria-hidden
                    className="text-ink-2"
                  />
                </span>
                {c.extra ? (
                  <span className="text-[14px] text-ink-2">{c.extra}</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// This room's next few dates plus the chapter's, soonest first; each opens the calendar on its month.
export function HubComingUp({ rows }: { rows: EventRow[] }) {
  return (
    <section aria-labelledby="hub-soon-h" className="grid gap-4">
      <div className="flex items-end justify-between gap-4 border-t-[3px] border-ink px-1 pt-3 sm:px-3">
        <h2
          id="hub-soon-h"
          className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
        >
          Coming up
        </h2>
        <Link
          href="/calendar"
          className="caps step inline-flex min-h-11 items-center gap-1 text-[16px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink"
        >
          Calendar
          <ChevronRight size={18} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      {rows.length ? (
        <ul className="border-t border-rule">
          {rows.map((e) => (
            <li key={e.id} className="border-b border-rule">
              <Link
                href={`/calendar?m=${dayKeyMonth(e.starts_at)}`}
                className="step grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4 px-1 py-3 hover:bg-band sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:px-3"
              >
                <DateStub iso={e.starts_at} />
                <EventSummary e={e} compact />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-y border-rule px-1 py-4 text-ink-2 sm:px-3">
          Nothing on the calendar for this event yet.
        </p>
      )}
    </section>
  );
}

// "2026-10" for the month an event starts in, Toronto time, so the link opens the right page of the grid.
function dayKeyMonth(iso: string): string {
  return dayKey(iso).slice(0, 7);
}
