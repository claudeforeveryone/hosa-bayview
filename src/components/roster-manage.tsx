"use client";

import { useActionState } from "react";
import { ChevronDown } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import {
  addRosterWeek,
  removeRosterMember,
  setShortCode,
} from "@/app/(app)/admin/attendance/roster-actions";
import { ConfirmAction } from "@/components/confirm-action";
import { Button, Field, FormMessage } from "@/components/form";
import type { TrackerPerson } from "@/components/attendance-tracker";

function Message({ state }: { state: FormState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.ok) return <FormMessage tone="ok">{state.ok}</FormMessage>;
  return null;
}

function AddWeek() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    addRosterWeek,
    {},
  );
  return (
    <form action={action} className="grid gap-3">
      <h3 className="caps text-16 font-semibold">Add a meeting date</h3>
      <p className="text-15 text-ink-2">
        Adds a column to every event&apos;s sheet.
      </p>
      <Field label="Date" name="date" id="roster-date" type="date" required />
      <Button
        type="submit"
        variant="line"
        className="justify-self-start"
        disabled={pending}
      >
        {pending ? "Adding" : "Add date"}
      </Button>
      <Message state={state} />
    </form>
  );
}

function ShortCode({
  classroomId,
  code,
}: {
  classroomId: string;
  code: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setShortCode.bind(null, classroomId),
    {},
  );
  return (
    <form action={action} className="grid gap-3">
      <h3 className="caps text-16 font-semibold">Event code</h3>
      <Field
        label="Code"
        name="code"
        id="roster-code"
        defaultValue={code ?? ""}
        maxLength={4}
        autoCapitalize="characters"
        autoComplete="off"
        hint="2 to 4 letters, like FS. Leave empty to clear."
        className="step h-12 w-32 border border-rule-strong bg-transparent px-3 text-17 uppercase outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
      />
      <Button
        type="submit"
        variant="line"
        className="justify-self-start"
        disabled={pending}
      >
        {pending ? "Saving" : "Save code"}
      </Button>
      <Message state={state} />
    </form>
  );
}

// Compact roster upkeep under the sheet. Meeting dates and event codes are executive-only (RLS agrees).
export function RosterManage({
  classroomId,
  code,
  members,
  isExec,
}: {
  classroomId: string;
  code: string | null;
  members: TrackerPerson[];
  isExec: boolean;
}) {
  return (
    <details className="group border-t-[3px] border-ink">
      <summary className="caps step flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-17 hover:bg-band [&::-webkit-details-marker]:hidden">
        Manage roster
        <ChevronDown
          size={20}
          strokeWidth={2}
          aria-hidden
          className="text-ink-2 group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200"
        />
      </summary>
      <div className="grid gap-8 pt-3 pb-6 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <h3 className="caps text-16 font-semibold">Who&apos;s on the list</h3>
          <p className="text-16 text-ink-2">
            Everyone who joins this event with its code shows up here automatically, and leaving takes them off.
          </p>
        </div>
        <div className="grid content-start gap-3">
          <h3 className="caps text-16 font-semibold">Remove a name</h3>
          {members.length === 0 ? (
            <p className="text-16 text-ink-2">No one has joined yet.</p>
          ) : (
            <ul className="border-t border-rule">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="grid gap-2 border-b border-rule py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="min-w-0 truncate text-17">{m.name}</span>
                  <ConfirmAction
                    action={() => removeRosterMember(m.id)}
                    label="Remove"
                    confirmLabel="Remove"
                    pendingLabel="Removing"
                    question={`Remove ${m.name} and all their marks?`}
                    compact
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        {isExec ? <AddWeek /> : null}
        {isExec ? <ShortCode classroomId={classroomId} code={code} /> : null}
      </div>
    </details>
  );
}
