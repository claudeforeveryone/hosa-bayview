"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";

type Values = { title: string; description: string; time_limit: string };

export function TestForm({
  action: serverAction,
  initial,
  submitLabel,
  pendingLabel,
  autoFocusTitle = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: Values;
  submitLabel: string;
  pendingLabel: string;
  // A fresh blank test: put the cursor on the title, selected, so it can be renamed at once.
  autoFocusTitle?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, { values: initial });
  const v = state.values ?? initial;
  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Field
        label="Title"
        name="title"
        required
        maxLength={120}
        defaultValue={v?.title}
        error={state.fieldErrors?.title}
        autoFocus={autoFocusTitle}
        onFocus={autoFocusTitle ? (e) => e.currentTarget.select() : undefined}
      />
      <Field
        label="Time limit (minutes)"
        name="time_limit"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        defaultValue={v?.time_limit}
        error={state.fieldErrors?.time_limit}
        hint="Blank means practice only."
        className="num step h-12 w-32 border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-danger"
      />
      <TextArea
        label="Description"
        name="description"
        maxLength={1000}
        defaultValue={v?.description}
        error={state.fieldErrors?.description}
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
