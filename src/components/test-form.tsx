"use client";

import { useActionState, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";
import {
  attemptsAfterAnswersToggle,
  moreOptionsSummary,
} from "@/lib/test-settings";

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

type ToggleName =
  "shuffle_questions" | "shuffle_choices" | "allow_practice" | "show_answers";

function Toggle({
  name,
  label,
  hint,
  checked,
  onChange,
  error,
}: {
  name: ToggleName;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
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
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        {label}
      </label>
      <p
        id={`${id}-hint`}
        className={`pl-8 text-[15px] ${error ? "text-danger" : "text-ink-2"}`}
      >
        {error ?? hint}
      </p>
    </div>
  );
}

const NUMBER_INPUT =
  "num step h-12 w-32 border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-danger";

// Title and time limit up front (posting lives in the page header); everything else under More options, which
// names any setting that is off its default so nothing hides silently.
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

  const [toggles, setToggles] = useState<Record<ToggleName, boolean>>(() => ({
    shuffle_questions: on("shuffle_questions", true),
    shuffle_choices: on("shuffle_choices", true),
    allow_practice: on("allow_practice", true),
    show_answers: on("show_answers", true),
  }));
  const [attempts, setAttempts] = useState(v?.attempts_allowed ?? "");
  const [moreOpen, setMoreOpen] = useState(false);
  const set = (name: ToggleName) => (checked: boolean) =>
    setToggles((t) => ({ ...t, [name]: checked }));

  const hiddenError = Boolean(
    state.fieldErrors?.attempts_allowed ||
    state.fieldErrors?.allow_practice ||
    state.fieldErrors?.description,
  );
  const summary = moreOptionsSummary({ ...toggles, attempts });

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
        className={NUMBER_INPUT}
      />

      <details
        open={moreOpen || hiddenError}
        onToggle={(e) => setMoreOpen(e.currentTarget.open)}
        className="group border-t border-rule pt-2"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="caps text-[16px]">More options</span>
          <ChevronDown
            size={18}
            strokeWidth={2}
            aria-hidden
            className="text-ink-2 group-open:rotate-180"
          />
          {summary ? (
            <span className="min-w-0 text-[15px] text-ink-2">{summary}</span>
          ) : null}
        </summary>
        <div className="grid gap-5 pt-3">
          <TextArea
            label="Description"
            name="description"
            maxLength={1000}
            defaultValue={v?.description}
            error={state.fieldErrors?.description}
            hint="Optional."
          />
          <Field
            label="Attempts allowed"
            name="attempts_allowed"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={attempts}
            onChange={(e) => setAttempts(e.target.value)}
            error={state.fieldErrors?.attempts_allowed}
            hint="Blank means unlimited. Practice runs of a timed test don't count."
            className={NUMBER_INPUT}
          />
          <Toggle
            name="show_answers"
            label="Show correct answers after submitting"
            hint="When off, members see only their score, and attempts start at 1."
            checked={toggles.show_answers}
            onChange={(checked) => {
              set("show_answers")(checked);
              setAttempts((a) => attemptsAfterAnswersToggle(checked, a));
            }}
          />
          <Toggle
            name="allow_practice"
            label="Allow practice mode"
            hint="Members get the right answer as they go. Needs a time limit to be off."
            checked={toggles.allow_practice}
            onChange={set("allow_practice")}
            error={state.fieldErrors?.allow_practice}
          />
          <Toggle
            name="shuffle_questions"
            label="Shuffle questions"
            hint="Each attempt gets its own order."
            checked={toggles.shuffle_questions}
            onChange={set("shuffle_questions")}
          />
          <Toggle
            name="shuffle_choices"
            label="Shuffle answer choices"
            hint="Each attempt gets its own order of A to D."
            checked={toggles.shuffle_choices}
            onChange={set("shuffle_choices")}
          />
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
