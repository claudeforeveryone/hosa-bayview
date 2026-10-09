import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { EventForm } from "@/components/event-form";
import { DateStub, EventSummary } from "@/components/event-item";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import { getMyClassrooms } from "@/lib/classrooms";
import { getEvents, type EventRow } from "@/lib/events";
import { dayKey, isoToToronto } from "@/lib/when";
import { deleteEvent, saveEvent } from "./actions";

export const metadata: Metadata = { title: "Calendar" };

// Events grouped by Toronto day, in order.
function byDay(rows: EventRow[]) {
  const days: { key: string; first: string; items: EventRow[] }[] = [];
  for (const e of rows) {
    const key = dayKey(e.starts_at);
    const last = days.at(-1);
    if (last?.key === key) last.items.push(e);
    else days.push({ key, first: e.starts_at, items: [e] });
  }
  return days;
}

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const sp = await props.searchParams;
  const past = sp.show === "past";
  const [me, rooms, rows] = await Promise.all([
    requireProfile(),
    getMyClassrooms(),
    getEvents({ past }),
  ]);
  const exec = me.role === "executive";
  const managed = rooms.filter((r) => r.can_manage);
  const managedIds = new Set(managed.map((r) => r.id));
  const canEdit = (e: EventRow) =>
    exec || (e.classroom_id !== null && managedIds.has(e.classroom_id));
  const places = [
    ...(exec ? [{ id: "chapter", label: "Whole chapter" }] : []),
    ...managed.map((r) => ({ id: r.id, label: r.name })),
  ];
  const days = byDay(rows);
  const tab = (on: boolean) =>
    `caps step flex h-11 items-center px-4 text-[16px] ${on ? "bg-ink text-ground" : "text-ink-2 hover:bg-band hover:text-ink"}`;

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle meta="Meetings, deadlines and comps">Calendar</PageTitle>

      <nav
        aria-label="Which events"
        className="flex w-max border border-rule-strong"
      >
        <Link
          href="/calendar"
          aria-current={!past ? "page" : undefined}
          className={tab(!past)}
        >
          Coming up
        </Link>
        <Link
          href="/calendar?show=past"
          aria-current={past ? "page" : undefined}
          className={tab(past)}
        >
          Past
        </Link>
      </nav>

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

      {days.length ? (
        <ol className="grid">
          {days.map((d) => (
            <li
              key={d.key}
              className="grid grid-cols-[4rem_minmax(0,1fr)] gap-4 border-t border-rule py-5 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-6"
            >
              <DateStub iso={d.first} />
              <ul className="grid gap-6">
                {d.items.map((e) => (
                  <li key={e.id} className="grid gap-3">
                    <EventSummary e={e} />
                    {canEdit(e) ? (
                      <div className="flex flex-wrap items-start gap-3">
                        <details className="max-w-2xl open:order-last open:basis-full">
                          <summary className="caps step inline-flex h-10 cursor-pointer items-center border border-ink px-4 text-[15px] text-ink hover:bg-band">
                            Edit
                          </summary>
                          <div className="pt-5">
                            <EventForm
                              action={saveEvent.bind(null, e.id)}
                              initial={{
                                title: e.title,
                                starts: isoToToronto(e.starts_at),
                                ends: isoToToronto(e.ends_at),
                                location: e.location,
                                details: e.details,
                                all_day: e.all_day,
                              }}
                              submitLabel="Save"
                              pendingLabel="Saving"
                            />
                          </div>
                        </details>
                        <ConfirmAction
                          action={deleteEvent.bind(null, e.id)}
                          label="Delete"
                          confirmLabel="Delete"
                          pendingLabel="Deleting"
                          question={`Delete ${e.title}?`}
                          compact
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          title={past ? "Nothing in the past yet" : "Nothing coming up"}
        >
          {past
            ? "Events show up here once they're over."
            : places.length
              ? "Add the next meeting or deadline above. Everyone it's for gets a notification."
              : "When your trainers or the execs add events, they land here."}
        </EmptyState>
      )}
    </div>
  );
}
