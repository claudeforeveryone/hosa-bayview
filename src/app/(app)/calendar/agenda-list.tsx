import { ConfirmAction } from "@/components/confirm-action";
import { EventForm } from "@/components/event-form";
import { DateStub, EventSummary } from "@/components/event-item";
import { groupByStartDay } from "@/lib/calendar-grid";
import type { EventRow } from "@/lib/events";
import { isoToToronto } from "@/lib/when";
import { deleteEvent, saveEvent } from "./actions";

// Days down the page, a date stub beside each day's events; managers edit and delete in place.
function Days({ rows, canEdit }: { rows: EventRow[]; canEdit: (e: EventRow) => boolean }) {
  return (
    <ol className="grid">
      {groupByStartDay(rows).map((d) => (
        <li
          key={d.key}
          className="grid grid-cols-[4rem_minmax(0,1fr)] gap-4 border-t border-rule py-5 first:border-t-0 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-6"
        >
          <DateStub iso={d.first} />
          <ul className="grid gap-6">
            {d.items.map((e) => (
              <li key={e.id} className="grid gap-3">
                <EventSummary e={e} />
                {canEdit(e) ? (
                  <div className="flex flex-wrap items-start gap-3">
                    <details className="max-w-2xl open:order-last open:basis-full">
                      <summary className="caps step inline-flex h-11 cursor-pointer items-center border border-ink px-4 text-15 text-ink hover:bg-band">
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
  );
}

// The agenda: everything coming up first (from the start of today), then past events folded underneath.
export function AgendaList({
  upcoming,
  past,
  editable,
  canAdd,
}: {
  upcoming: EventRow[];
  past: EventRow[];
  editable: Set<string>;
  canAdd: boolean;
}) {
  const canEdit = (e: EventRow) => editable.has(e.id);
  return (
    <div className="grid gap-8">
      <section aria-labelledby="soon-h" className="grid gap-4">
        <h2
          id="soon-h"
          className="border-t-[3px] border-ink px-1 pt-3 font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-none font-bold uppercase sm:px-3"
        >
          Coming up
        </h2>
        {upcoming.length ? (
          <Days rows={upcoming} canEdit={canEdit} />
        ) : (
          <div className="grid justify-items-start gap-3 border-2 border-ink px-4 py-8">
            <p className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
              Nothing coming up
            </p>
            <p className="max-w-[60ch] text-17 text-ink-2">
            {canAdd
              ? "Add the next meeting, deadline or study plan above. Shared events notify everyone they're for; your own stay private."
              : "When your trainers or the execs add events, they land here."}
            </p>
          </div>
        )}
      </section>

      {past.length ? (
        <details className="group border-t-[3px] border-ink">
          <summary className="caps step flex h-14 cursor-pointer items-center justify-between px-1 text-18 hover:bg-band sm:px-3">
            Past
            <span className="num text-15 text-ink-2">{past.length}</span>
          </summary>
          <div className="pb-4">
            <Days rows={past} canEdit={canEdit} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
