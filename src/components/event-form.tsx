"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import {
  Button,
  Field,
  FormMessage,
  Select,
  TextArea,
} from "@/components/form";

export type EventValues = {
  title: string;
  starts: string;
  ends: string;
  location: string;
  details: string;
  all_day?: boolean;
};

// Add or edit one event. Times are typed in Toronto time. `places` (chapter and/or classes you run) only
// shows when adding; an event stays where it was made.
export function EventForm({
  action,
  initial,
  places,
  submitLabel,
  pendingLabel,
  resetOnSave = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: EventValues;
  places?: { id: string; label: string }[];
  submitLabel: string;
  pendingLabel: string;
  resetOnSave?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const v =
    (state.values as Partial<EventValues & { where: string }> | undefined) ??
    initial;

  // All day swaps the date-time pickers for plain date pickers.
  const [allDay, setAllDay] = useState(Boolean(initial?.all_day));
  const kind = allDay ? "date" : "datetime-local";
  const shown = (val?: string) => (allDay ? val?.slice(0, 10) : val);

  useEffect(() => {
    if (resetOnSave && state.ok) formRef.current?.reset();
  }, [state, resetOnSave]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid max-w-2xl gap-5"
      noValidate
    >
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      {places ? (
        <Select
          id={`${uid}-where`}
          label="For"
          name="where"
          defaultValue={
            (state.values?.where as string | undefined) ?? places[0]?.id
          }
          error={state.fieldErrors?.where}
        >
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      ) : null}
      <Field
        id={`${uid}-title`}
        label="What"
        name="title"
        maxLength={120}
        defaultValue={v?.title}
        error={state.fieldErrors?.title}
        placeholder="Chapter meeting"
      />
      <label
        htmlFor={`${uid}-allday`}
        className="flex min-h-11 items-center gap-3 text-17"
      >
        <input
          id={`${uid}-allday`}
          name="all_day"
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        All day
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          key={`starts-${kind}`}
          id={`${uid}-starts`}
          label={allDay ? "First day" : "Starts"}
          name="starts"
          type={kind}
          defaultValue={shown(v?.starts)}
          error={state.fieldErrors?.starts}
          hint={allDay ? undefined : "Toronto time."}
        />
        <Field
          key={`ends-${kind}`}
          id={`${uid}-ends`}
          label={allDay ? "Last day" : "Ends"}
          name="ends"
          type={kind}
          defaultValue={shown(v?.ends)}
          error={state.fieldErrors?.ends}
          hint={allDay ? "Optional, for events over several days." : "Optional."}
        />
      </div>
      <Field
        id={`${uid}-location`}
        label="Where"
        name="location"
        maxLength={200}
        defaultValue={v?.location}
        error={state.fieldErrors?.location}
        hint="Optional. Room 214, the library, a Meet link."
      />
      <TextArea
        id={`${uid}-details`}
        label="Details"
        name="details"
        maxLength={2000}
        defaultValue={v?.details}
        error={state.fieldErrors?.details}
        hint="Optional."
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
