"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Combobox } from "@/components/combobox";
import { Button, Field, FormMessage, TextArea } from "@/components/form";
import { HOSA_EVENTS } from "@/lib/hosa-events";

type Values = { name: string; event: string; description: string; category?: string };

const CATEGORIES = [
  { id: "mc", label: "MC" },
  { id: "practical", label: "Practical" },
  { id: "showcase", label: "Showcase" },
];

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
      <Combobox
        label="HOSA event"
        name="event"
        options={HOSA_EVENTS}
        maxLength={80}
        defaultValue={v?.event}
        error={state.fieldErrors?.event}
      />
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-[15px] font-medium">Event type</legend>
        <div className="grid grid-cols-3 border border-rule-strong">
          {CATEGORIES.map((c) => (
            <label key={c.id} className="relative border-r border-rule-strong last:border-r-0">
              <input
                type="radio"
                name="category"
                value={c.id}
                defaultChecked={v?.category === c.id}
                aria-describedby={state.fieldErrors?.category ? "f-category-err" : "f-category-hint"}
                className="peer sr-only"
              />
              <span className="caps step flex h-12 cursor-pointer items-center justify-center text-[16px] text-ink peer-checked:bg-ink peer-checked:text-ground peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-ground hover:bg-band peer-checked:hover:bg-ink">
                {c.label}
              </span>
            </label>
          ))}
        </div>
        {state.fieldErrors?.category ? (
          <p id="f-category-err" className="text-[15px] text-danger">
            {state.fieldErrors.category}
          </p>
        ) : (
          <p id="f-category-hint" className="text-[15px] text-ink-2">
            Practical adds Skills. Showcase has no tests.
          </p>
        )}
      </fieldset>
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
