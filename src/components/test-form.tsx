"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";

// Checkboxes travel as "on" or "" so they fit the string-valued form state.
export type TestFormValues = {
  title: string;
  description: string;
  time_limit: string;
  attempts_allowed: string;
  shuffle_questions: string;
  shuffle_choices: string;
  allow_practice: string;
  show_answers: string;
};

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  error,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
  error?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="grid gap-1">
      <label
        htmlFor={id}
        className="flex min-h-11 items-center gap-3 text-[17px]"
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        {label}
      </label>
      <p id={`${id}-hint`} className="pl-8 text-[15px] text-ink-2">
        {error ?? hint}
      </p>
    </div>
  );
}

export function TestForm({
  action: serverAction,
  initial,
  submitLabel,
  pendingLabel,
  autoFocusTitle = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: TestFormValues;
  submitLabel: string;
  pendingLabel: string;
  // A fresh blank test: put the cursor on the title, selected, so it can be renamed at once.
  autoFocusTitle?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    serverAction,
    { values: initial },
  );
  const v = (state.values ?? initial) as Partial<TestFormValues> | undefined;
  const on = (key: keyof TestFormValues, fallback: boolean) =>
    v ? v[key] === "on" : fallback;
  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
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
      <Field
        label="Attempts allowed"
        name="attempts_allowed"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        defaultValue={v?.attempts_allowed}
        error={state.fieldErrors?.attempts_allowed}
        hint="Blank means unlimited. Practice runs of a timed test don't count."
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
      <fieldset className="grid gap-4 border-t border-rule pt-5">
        <legend className="caps mb-1 text-[16px] text-ink-2">Settings</legend>
        <Toggle
          name="shuffle_questions"
          label="Shuffle questions"
          hint="Each attempt gets its own order."
          defaultChecked={on("shuffle_questions", true)}
        />
        <Toggle
          name="shuffle_choices"
          label="Shuffle answer choices"
          hint="Each attempt gets its own order of A to D."
          defaultChecked={on("shuffle_choices", true)}
        />
        <Toggle
          name="allow_practice"
          label="Allow practice mode"
          hint="Members get the right answer as they go. Needs a time limit to be off."
          defaultChecked={on("allow_practice", true)}
          error={state.fieldErrors?.allow_practice}
        />
        <Toggle
          name="show_answers"
          label="Show correct answers after submitting"
          hint="When off, members see whether they were right, not which answer was."
          defaultChecked={on("show_answers", true)}
        />
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
