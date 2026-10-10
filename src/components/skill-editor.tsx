"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";

type Values = { name: string; round: string; steps: string; note: string };

// Add or edit one skill. Steps are typed one per line; "| 5" at the end of a line scores it.
// Adding clears the form; editing keeps what was typed.
export function SkillEditor({
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
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const v: Partial<Values> | undefined =
    state.values && Object.keys(state.values).length ? state.values : initial;

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
      <Field
        id={`${uid}-name`}
        label="Skill"
        name="name"
        maxLength={120}
        defaultValue={v?.name}
        error={state.fieldErrors?.name}
      />
      <Field
        id={`${uid}-round`}
        label="Round"
        name="round"
        maxLength={80}
        defaultValue={v?.round}
        error={state.fieldErrors?.round}
        hint="Optional."
      />
      <TextArea
        id={`${uid}-steps`}
        label="Steps"
        name="steps"
        rows={8}
        defaultValue={v?.steps}
        error={state.fieldErrors?.steps}
        hint="One per line. End a line with | 2 to score that step."
      />
      <TextArea
        id={`${uid}-note`}
        label="Note"
        name="note"
        maxLength={500}
        rows={2}
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
