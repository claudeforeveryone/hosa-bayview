import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EventForm } from "@/components/event-form";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import {
  bucketByDay,
  gridDays,
  gridRange,
  monthLabel,
  monthParam,
  parseMonth,
  shiftMonth,
} from "@/lib/calendar-grid";
import { getMyClassrooms } from "@/lib/classrooms";
import { getEventsInRange } from "@/lib/events";
import { dayKey } from "@/lib/when";
import { saveEvent } from "./actions";
import { MonthGrid } from "./month-grid";

export const metadata: Metadata = { title: "Calendar" };

// A month of boxes, Toronto days. `?m=2026-10` picks the month; anything else shows this one.
export default async function CalendarPage(props: PageProps<"/calendar">) {
  const sp = await props.searchParams;
  const todayKey = dayKey(new Date().toISOString());
  const month = parseMonth(sp.m, todayKey);
  const days = gridDays(month);
  const { from, to } = gridRange(days);
  const [me, rooms, rows] = await Promise.all([
    requireProfile(),
    getMyClassrooms(),
    getEventsInRange(from, to),
  ]);
  const exec = me.role === "executive";
  const managed = rooms.filter((r) => r.can_manage);
  const managedIds = new Set(managed.map((r) => r.id));
  const editable = rows
    .filter((e) => exec || (e.classroom_id !== null && managedIds.has(e.classroom_id)))
    .map((e) => e.id);
  const places = [
    ...(exec ? [{ id: "chapter", label: "Whole chapter" }] : []),
    ...managed.map((r) => ({ id: r.id, label: r.name })),
  ];
  const byDay = bucketByDay(rows, days);
  const inMonth = days.some((d) => d.inMonth && byDay[d.key]?.length);
  const thisMonth = monthParam(parseMonth(undefined, todayKey));
  const showing = monthParam(month);
  const step =
    "step grid size-11 place-items-center border border-rule-strong text-ink hover:bg-band";

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle meta="Meetings, deadlines and comps">Calendar</PageTitle>

      {places.length ? (
        <details className="group border-y border-rule">
          <summary className="caps step flex h-14 cursor-pointer items-center justify-between px-1 text-[18px] hover:bg-band sm:px-3">
            Add an event
            <Plus
              size={22}
              strokeWidth={1.75}
              aria-hidden
              className="group-open:rotate-45"
            />
          </summary>
          <div className="px-1 pt-2 pb-8 sm:px-3">
            <EventForm
              action={saveEvent.bind(null, null)}
              places={places}
              submitLabel="Add event"
              pendingLabel="Adding"
              resetOnSave
            />
          </div>
        </details>
      ) : null}

      <section aria-labelledby="month-h" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="month-h"
            className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-none font-bold uppercase"
          >
            {monthLabel(month)}
          </h2>
          <nav aria-label="Month" className="flex items-center gap-2">
            <Link
              href={`/calendar?m=${monthParam(shiftMonth(month, -1))}`}
              aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}
              className={step}
            >
              <ChevronLeft size={22} strokeWidth={1.75} aria-hidden />
            </Link>
            <Link
              href="/calendar"
              aria-current={showing === thisMonth ? "page" : undefined}
              className="caps step flex h-11 items-center border border-rule-strong px-4 text-[15px] text-ink hover:bg-band aria-[current=page]:bg-ink aria-[current=page]:text-ground"
            >
              Today
            </Link>
            <Link
              href={`/calendar?m=${monthParam(shiftMonth(month, 1))}`}
              aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}
              className={step}
            >
              <ChevronRight size={22} strokeWidth={1.75} aria-hidden />
            </Link>
          </nav>
        </div>

        <MonthGrid days={days} byDay={byDay} todayKey={todayKey} editable={editable} />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-ink-2">
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-3.5 w-[3px] bg-you" />
            Chapter
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-3.5 w-[3px] bg-ink-2" />
            Event rooms
          </span>
          {!inMonth ? (
            <span>
              Nothing on the calendar this month.
              {places.length ? " Add a meeting or deadline above; everyone it's for gets a notification." : ""}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
