"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";

type Values = { title: string; url: string; note: string };

// Add or edit one link. Adding clears the form after it saves; editing keeps what was typed.
export function ResourceForm({
  action,
  initial,
  submitLabel,
  pendingLabel,
  resetOnSave = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: Values;
  submitLabel: string;
  pendingLabel: string;
  resetOnSave?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const v = state.values ?? initial;

  useEffect(() => {
    if (resetOnSave && state.ok) formRef.current?.reset();
  }, [state, resetOnSave]);

  return (
    <form ref={formRef} action={formAction} className="grid max-w-xl gap-5" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Field
        id={`${uid}-title`}
        label="Title"
        name="title"
        maxLength={120}
        defaultValue={v?.title}
        error={state.fieldErrors?.title}
      />
      <Field
        id={`${uid}-url`}
        label="Web address"
        name="url"
        type="url"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="https://"
        defaultValue={v?.url}
        error={state.fieldErrors?.url}
        hint="Opens in a new tab."
      />
      <TextArea
        id={`${uid}-note`}
        label="Note"
        name="note"
        maxLength={500}
        defaultValue={v?.note}
        error={state.fieldErrors?.note}
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
