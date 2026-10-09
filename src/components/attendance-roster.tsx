"use client";

import { useActionState, useId, useState } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, Field, FormMessage } from "@/components/form";
import { countStatuses, nextStatus, STATUS_LABEL, STATUSES, type Status } from "@/lib/attendance";

type Member = { user_id: string; full_name: string };

// Each tap moves a member one step through the statuses. Nothing is saved until the button is pressed.
const TONE: Record<Status | "none", string> = {
  present: "border-ink bg-ink text-ground",
  late: "border-ink text-ink",
  absent: "border-you bg-you text-on-you",
  excused: "border-rule-strong text-ink-2",
  none: "border-dashed border-rule-strong text-ink-2",
};

export function AttendanceRoster({
  action,
  date,
  members,
  initial,
  initialNote,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  date: string;
  members: Member[];
  initial: Record<string, Status>;
  initialNote: string;
}) {
  const [marks, setMarks] = useState<Record<string, Status>>(initial);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const uid = useId();

  const tap = (userId: string) =>
    setMarks((prev) => {
      const next = nextStatus(prev[userId] ?? null);
      const copy = { ...prev };
      if (next) copy[userId] = next;
      else delete copy[userId];
      return copy;
    });

  // Only current members are sent, so a removed member's old mark can't be re-saved by accident.
  const payload: Record<string, Status> = {};
  for (const m of members) if (marks[m.user_id]) payload[m.user_id] = marks[m.user_id];
  const counts = countStatuses(Object.values(payload));
  const unmarked = members.length - Object.keys(payload).length;

  return (
    <form action={formAction} className="grid max-w-2xl gap-6" noValidate>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="statuses" value={JSON.stringify(payload)} />

      <p className="caps flex flex-wrap gap-x-5 gap-y-1 text-[16px] text-ink-2">
        {STATUSES.map((s) => (
          <span key={s}>
            {STATUS_LABEL[s]} <span className="num font-semibold text-ink">{counts[s]}</span>
          </span>
        ))}
        <span>
          Not marked <span className="num font-semibold text-ink">{unmarked}</span>
        </span>
      </p>

      <ul className="border-t border-rule">
        {members.map((m) => {
          const s = marks[m.user_id] ?? null;
          return (
            <li key={m.user_id} className="border-b border-rule">
              <button
                type="button"
                onClick={() => tap(m.user_id)}
                className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-2 text-left hover:bg-band sm:px-3"
              >
                <span className="min-w-0 truncate text-[19px] font-semibold">{m.full_name}</span>
                <span
                  className={`caps inline-flex h-11 w-32 items-center justify-center border text-[16px] ${TONE[s ?? "none"]}`}
                >
                  {s ? STATUS_LABEL[s] : "Not marked"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Field
        id={`${uid}-note`}
        label="Session note"
        name="note"
        maxLength={500}
        defaultValue={initialNote}
        hint={`Optional. For ${date}. Members don't see it.`}
      />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save attendance"}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
