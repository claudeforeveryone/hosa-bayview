"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { EventForm } from "@/components/event-form";
import { DateStub, EventSummary } from "@/components/event-item";
import type { GridDay } from "@/lib/calendar-grid";
import type { EventRow } from "@/lib/events";
import { formatTime, isoToToronto, torontoToIso } from "@/lib/when";
import { deleteEvent, saveEvent } from "./actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHOWN = 3;

// "Wednesday, October 14" for a day key, without a time zone shift (noon Toronto is the same day everywhere).
const dayTitle = (key: string) =>
  new Date(torontoToIso(`${key}T12:00`) ?? `${key}T16:00:00Z`).toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

// Chapter-wide events carry the highlight colour; event-room ones stay ink.
const tone = (e: EventRow) => (e.classroom_id ? "border-ink-2" : "border-you");

function Chip({ e, onOpen }: { e: EventRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen();
      }}
      className={`step flex w-full min-w-0 items-baseline gap-1.5 border-l-[3px] bg-band px-1.5 py-0.5 text-left text-[13px] leading-tight hover:bg-rule focus-visible:outline-2 focus-visible:outline-ink ${tone(e)}`}
    >
      {!e.all_day ? (
        <span className="num shrink-0 text-ink-2">{formatTime(e.starts_at).replace(/\s?[ap]\.m\./i, "")}</span>
      ) : null}
      <span className="truncate font-medium">{e.title}</span>
    </button>
  );
}

// The month as boxes. Hover a day (mouse) for its events; click a day or an event (or Enter on it) to pin the
// details in a dialog, where managers also edit and delete.
export function MonthGrid({
  days,
  byDay,
  todayKey,
  editable,
}: {
  days: GridDay[];
  byDay: Record<string, EventRow[]>;
  todayKey: string;
  editable: string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<{ key: string; focus: string | null } | null>(null);
  const canEdit = new Set(editable);
  const rows = days.length / 7;

  const show = (key: string, focus: string | null = null) => {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen({ key, focus });
  };

  useEffect(() => {
    const d = dialog.current;
    if (!d || !open) return;
    if (!d.open) d.showModal();
    const target = open.focus ? d.querySelector<HTMLElement>(`[data-event="${open.focus}"]`) : null;
    if (target) {
      target.scrollIntoView({ block: "nearest" });
      target.focus({ preventScroll: true });
    }
  }, [open]);

  const onClose = () => {
    setOpen(null);
    opener.current?.focus?.();
  };

  const monthEvents = days
    .filter((d) => d.inMonth && byDay[d.key]?.length)
    .map((d) => ({ key: d.key, items: byDay[d.key] }));
  const openItems = open ? (byDay[open.key] ?? []) : [];

  return (
    <>
      <div className="border-t border-l border-rule-strong">
        <div aria-hidden className="grid grid-cols-7">
          {WEEKDAYS.map((w) => (
            <span
              key={w}
              className="caps border-r border-b border-rule-strong px-1.5 py-1.5 text-center text-[12px] text-ink-2 sm:text-left sm:text-[13px]"
            >
              <span className="sm:hidden">{w[0]}</span>
              <span className="hidden sm:inline">{w}</span>
            </span>
          ))}
        </div>
        <ol className="grid grid-cols-7" aria-label="Days">
          {days.map((d, i) => {
            const items = byDay[d.key] ?? [];
            const today = d.key === todayKey;
            const col = i % 7;
            const row = Math.floor(i / 7);
            const label = `${dayTitle(d.key)}${items.length ? `: ${items.length} ${items.length === 1 ? "event" : "events"}` : ""}`;
            return (
              <li
                key={d.key}
                onClick={items.length ? () => show(d.key) : undefined}
                className={`group relative min-h-14 border-r border-b border-rule-strong p-1 sm:min-h-[7.5rem] sm:p-1.5 ${
                  d.inMonth ? "" : "bg-band/60 text-ink-2"
                } ${items.length ? "cursor-pointer hover:bg-band" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  {items.length ? (
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        show(d.key);
                      }}
                      aria-label={label}
                      className={`num grid size-7 place-items-center font-display text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-ink sm:text-[16px] ${
                        today ? "bg-you text-on-you" : ""
                      }`}
                    >
                      {d.day}
                    </button>
                  ) : (
                    <span
                      aria-label={label}
                      className={`num grid size-7 place-items-center font-display text-[15px] font-semibold sm:text-[16px] ${
                        today ? "bg-you text-on-you" : d.inMonth ? "" : "opacity-70"
                      }`}
                    >
                      {d.day}
                    </span>
                  )}
                  {/* Phones: too narrow for titles, so a count. */}
                  {items.length ? (
                    <span aria-hidden className="num mt-1 mr-0.5 text-[12px] font-semibold text-you sm:hidden">
                      {items.length}
                    </span>
                  ) : null}
                </div>
                <ul className="mt-1 hidden gap-1 sm:grid">
                  {items.slice(0, SHOWN).map((e) => (
                    <li key={e.id}>
                      <Chip e={e} onOpen={() => show(d.key, e.id)} />
                    </li>
                  ))}
                  {items.length > SHOWN ? (
                    <li className="caps px-1.5 text-[12px] text-ink-2">+{items.length - SHOWN} more</li>
                  ) : null}
                </ul>

                {/* Mouse hover: the day's details beside the box, flipped inward near the edges. */}
                {items.length ? (
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute z-30 hidden w-80 border border-rule-strong bg-ground p-4 text-ink pointer-fine:group-hover:grid ${
                      col < 4 ? "left-full -ml-px" : "right-full -mr-px"
                    } ${row >= rows - 2 ? "bottom-0" : "top-0"}`}
                  >
                    <p className="caps mb-3 border-b border-rule pb-2 text-[13px] text-ink-2">{dayTitle(d.key)}</p>
                    <ul className="grid gap-4">
                      {items.slice(0, 4).map((e) => (
                        <li key={e.id} className="[&_.font-display]:text-[1.25rem]">
                          <EventSummary e={e} compact />
                          {e.details ? (
                            <p className="mt-1 line-clamp-3 text-[15px] whitespace-pre-line">{e.details}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {items.length > 4 ? (
                      <p className="caps mt-3 text-[12px] text-ink-2">+{items.length - 4} more. Click for all.</p>
                    ) : (
                      <p className="caps mt-3 text-[12px] text-ink-2">Click for details</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Phones: the month as a list under the grid. */}
      {monthEvents.length ? (
        <ol className="grid sm:hidden" aria-label="This month">
          {monthEvents.map((d) => (
            <li key={d.key} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-4 border-t border-rule py-4">
              <DateStub iso={torontoToIso(`${d.key}T12:00`) ?? d.items[0].starts_at} />
              <ul className="grid gap-3">
                {d.items.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => show(d.key, e.id)}
                      className="step block w-full text-left hover:bg-band"
                    >
                      <EventSummary e={e} compact />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : null}

      <dialog
        ref={dialog}
        onClose={onClose}
        onClick={(ev) => {
          if (ev.target === dialog.current) dialog.current?.close();
        }}
        aria-label={open ? dayTitle(open.key) : "Day"}
        className="m-auto max-h-[min(44rem,90dvh)] w-[min(40rem,calc(100vw-2rem))] max-w-none overflow-y-auto border border-rule-strong bg-ground p-0 text-ink backdrop:bg-[#0f2440]/60"
      >
        {open ? (
          <div className="grid gap-5 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-rule pb-3">
              <h2 className="font-display text-[clamp(1.6rem,5vw,2.1rem)] leading-none font-bold uppercase">
                {dayTitle(open.key)}
              </h2>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                aria-label="Close"
                className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center"
              >
                <X size={24} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            {openItems.length ? (
              <ul className="grid gap-6">
                {openItems.map((e) => (
                  <li
                    key={e.id}
                    data-event={e.id}
                    tabIndex={-1}
                    className="grid gap-3 border-b border-rule pb-6 outline-none last:border-b-0 last:pb-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
                  >
                    <EventSummary e={e} />
                    {canEdit.has(e.id) ? (
                      <div className="flex flex-wrap items-start gap-3">
                        <details className="open:order-last open:basis-full">
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
            ) : (
              <p className="text-ink-2">Nothing on this day any more.</p>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
