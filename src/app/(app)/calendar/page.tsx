import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EventForm } from "@/components/event-form";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import {
  CALENDAR_VIEW_COOKIE,
  bucketByDay,
  gridDays,
  gridRange,
  monthLabel,
  monthParam,
  parseMonth,
  pickView,
  shiftMonth,
} from "@/lib/calendar-grid";
import { getMyClassrooms } from "@/lib/classrooms";
import { getEvents, getEventsInRange } from "@/lib/events";
import { dayKey } from "@/lib/when";
import { saveEvent } from "./actions";
import { AgendaList } from "./agenda-list";
import { MonthGrid } from "./month-grid";
import { ViewSwitch } from "./view-switch";

export const metadata: Metadata = { title: "Calendar" };

// A month of boxes, Toronto days (`?m=2026-10` picks the month), or the agenda list (`?view=list`): coming up
// first, past folded under it. The last view picked is remembered on this device.
export default async function CalendarPage(props: PageProps<"/calendar">) {
  const sp = await props.searchParams;
  const jar = await cookies();
  const view = pickView(sp.view, sp.m, jar.get(CALENDAR_VIEW_COOKIE)?.value);
  const todayKey = dayKey(new Date().toISOString());
  const month = parseMonth(sp.m, todayKey);
  const days = gridDays(month);
  const { from, to } = gridRange(days);
  const [me, rooms, rows, upcoming, past] = await Promise.all([
    requireProfile(),
    getMyClassrooms(),
    view === "month" ? getEventsInRange(from, to) : Promise.resolve([]),
    view === "list" ? getEvents() : Promise.resolve([]),
    view === "list" ? getEvents({ past: true, limit: 60 }) : Promise.resolve([]),
  ]);
  const exec = me.role === "executive";
  const managed = rooms.filter((r) => r.can_manage);
  const managedIds = new Set(managed.map((r) => r.id));
  // Your own events are always yours to edit; nobody else ever sees them.
  const editable = [...rows, ...upcoming, ...past]
    .filter(
      (e) =>
        e.owner_id === me.id ||
        (e.owner_id === null && (exec || (e.classroom_id !== null && managedIds.has(e.classroom_id)))),
    )
    .map((e) => e.id);
  const places = [
    { id: "me", label: "Just me (only you see it)" },
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

      <ViewSwitch view={view} />

      {places.length ? (
        // One rule above only: the month or list below brings its own, so the two never stack up.
        <details className="group border-t-2 border-ink">
          <summary className="caps step flex h-14 cursor-pointer items-center justify-between px-1 text-18 hover:bg-band sm:px-3">
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

      {view === "list" ? (
        <AgendaList
          upcoming={upcoming}
          past={past}
          editable={new Set(editable)}
          canAdd={places.length > 0}
        />
      ) : (
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
                href="/calendar?view=month"
                aria-current={showing === thisMonth ? "page" : undefined}
                className="caps step flex h-11 items-center border border-rule-strong px-4 text-15 text-ink hover:bg-band aria-[current=page]:bg-ink aria-[current=page]:text-ground"
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
  
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-14 text-ink-2">
            <span className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-3.5 w-[3px] bg-you" />
              Chapter
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-3.5 w-[3px] bg-ink-2" />
              Event rooms
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-3.5 w-[3px] bg-rule-strong" />
              Just you
            </span>
            {!inMonth ? (
              <span>
                Nothing on the calendar this month.
                {places.length > 1
                  ? " Add a meeting or deadline above; everyone it's for gets a notification."
                  : " Add your own study plans or deadlines above."}
              </span>
            ) : null}
          </div>
        </section>
)}
    </div>
  );
}
