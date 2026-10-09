"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Combobox } from "@/components/combobox";
import { Button, Field, FormMessage, TextArea } from "@/components/form";
import { HOSA_EVENTS } from "@/lib/hosa-events";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

// Executives only (the page hides this and the server action checks again). Times are Toronto time.
export function CompetitionForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const v = state.values;
  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      <Field
        label="Name"
        name="name"
        required
        maxLength={80}
        defaultValue={v?.name}
        error={state.fieldErrors?.name}
      />
      <Combobox
        label="HOSA event"
        name="event"
        options={HOSA_EVENTS}
        maxLength={80}
        defaultValue={v?.event}
        error={state.fieldErrors?.event}
      />
      <TextArea
        label="Description"
        name="description"
        maxLength={1000}
        defaultValue={v?.description}
        error={state.fieldErrors?.description}
        hint="Optional. Rules, what to bring, anything members should know."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Opens (Toronto time)"
          name="opens"
          type="datetime-local"
          defaultValue={v?.opens}
          error={state.fieldErrors?.opens}
          hint="Blank opens it now."
        />
        <Field
          label="Closes (Toronto time)"
          name="closes"
          type="datetime-local"
          defaultValue={v?.closes}
          error={state.fieldErrors?.closes}
          hint="Blank means no end."
        />
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Posting" : "Post competition"}
      </Button>
    </form>
  );
}

// Edit an existing competition's window. The values come from the server so the inputs show what's saved.
export function WindowForm({
  action,
  initialOpens,
  initialCloses,
}: {
  action: Action;
  initialOpens: string;
  initialCloses: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {
      values: { opens: initialOpens, closes: initialCloses },
    },
  );
  const v = state.values ?? { opens: initialOpens, closes: initialCloses };
  return (
    <form action={formAction} className="grid max-w-xl gap-5" noValidate>
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Opens (Toronto time)"
          name="opens"
          type="datetime-local"
          defaultValue={v.opens}
          error={state.fieldErrors?.opens}
          hint="Blank opens it now."
        />
        <Field
          label="Closes (Toronto time)"
          name="closes"
          type="datetime-local"
          defaultValue={v.closes}
          error={state.fieldErrors?.closes}
          hint="Blank means no end."
        />
      </div>
      <Button
        type="submit"
        variant="line"
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? "Saving" : "Save times"}
      </Button>
    </form>
  );
}
