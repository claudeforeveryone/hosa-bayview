"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";
import { HOSA_EVENTS } from "@/lib/hosa-events";

type Values = { name: string; event: string; description: string };

export function ClassroomForm({
  action: serverAction,
  initial,
  submitLabel,
  pendingLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: Values;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, { values: initial });
  const v = state.values ?? initial;
  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      <Field
        label="Name"
        name="name"
        required
        maxLength={80}
        defaultValue={v?.name}
        error={state.fieldErrors?.name}
      />
      <Field
        label="HOSA event"
        name="event"
        list="hosa-events"
        maxLength={80}
        autoComplete="off"
        defaultValue={v?.event}
        error={state.fieldErrors?.event}
        hint="Pick one or type your own."
      />
      <datalist id="hosa-events">
        {HOSA_EVENTS.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <TextArea
        label="Description"
        name="description"
        maxLength={1000}
        defaultValue={v?.description}
        error={state.fieldErrors?.description}
        hint="Optional."
      />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
