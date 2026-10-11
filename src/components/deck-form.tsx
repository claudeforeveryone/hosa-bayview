"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";

export type ShareOption = { id: string; name: string };

// New and edit. Classroom is picked only when making a deck; sharing needs a classroom.
export function DeckForm({
  action,
  initial,
  classrooms,
  defaultShared = false,
  submitLabel,
  pendingLabel,
  autoFocusTitle = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: { title: string; description: string; classroom_id?: string | null; is_shared?: boolean };
  classrooms?: ShareOption[];
  defaultShared?: boolean;
  submitLabel: string;
  pendingLabel: string;
  // A fresh blank deck: put the cursor on the title, selected, so it can be renamed at once.
  autoFocusTitle?: boolean;
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, {
    values: initial
      ? { title: initial.title, description: initial.description, classroom_id: initial.classroom_id ?? "", shared: initial.is_shared ? "on" : "" }
      : undefined,
  });
  const v = state.values;
  const uid = useId();
  const picked = v?.classroom_id ?? initial?.classroom_id ?? "";

  return (
    <form action={run} className="grid max-w-xl gap-5" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Field
        label="Title"
        name="title"
        required
        maxLength={120}
        defaultValue={v?.title ?? initial?.title}
        error={state.fieldErrors?.title}
        autoFocus={autoFocusTitle}
        onFocus={autoFocusTitle ? (e) => e.currentTarget.select() : undefined}
      />
      <TextArea
        label="Description"
        name="description"
        maxLength={1000}
        rows={2}
        defaultValue={v?.description ?? initial?.description}
        error={state.fieldErrors?.description}
        hint="Optional."
      />
      {classrooms ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${uid}-classroom`} className="text-15 font-medium">
            Event
          </label>
          <select
            id={`${uid}-classroom`}
            name="classroom_id"
            defaultValue={picked}
            className="step h-12 w-full border border-rule-strong bg-ground px-3 text-17 outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
          >
            <option value="">Private, just me</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {classrooms ? (
        <label className="flex items-start gap-3 text-17">
          <input
            type="checkbox"
            name="shared"
            defaultChecked={v ? v.shared === "on" : (initial?.is_shared ?? defaultShared)}
            className="mt-1 size-5 accent-[var(--you)]"
          />
          <span>
            Share with the event
            <span className="block text-15 text-ink-2">Everyone in the event can study it. Pick an event first.</span>
          </span>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
