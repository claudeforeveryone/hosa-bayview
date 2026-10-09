"use client";

import { useActionState, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { saveQuestion } from "@/app/(app)/c/[id]/tests/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";

export type BuilderQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number | null;
  explanation: string;
};

const MIN_CHOICES = 2;
const MAX_CHOICES = 5;
const START_CHOICES = 4;

type Choice = { key: number; value: string };

// Type the question, then the choices, and mark which one is right. Members get them shuffled.
export function QuestionBuilder({
  testId,
  question,
  onDone,
}: {
  testId: string;
  question?: BuilderQuestion;
  onDone?: () => void;
}) {
  const uid = useId();
  const [choices, setChoices] = useState<Choice[]>(() =>
    question
      ? question.options.map((value, key) => ({ key, value }))
      : Array.from({ length: START_CHOICES }, (_, key) => ({ key, value: "" })),
  );
  const [nextKey, setNextKey] = useState(choices.length);
  // Which choice is right, by its stable key (so removing or adding rows doesn't move the mark).
  const [rightKey, setRightKey] = useState(question?.correct_index ?? 0);
  const [version, setVersion] = useState(0);

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, form) => {
      const result = await saveQuestion(
        testId,
        question?.id ?? null,
        prev,
        form,
      );
      if (result.fieldErrors || result.error) {
        // The form resets after an action; put back what was typed and the mark.
        const typed = form.getAll("choice").map(String);
        const pos = Number(form.get("correct"));
        setChoices(typed.map((value, i) => ({ key: nextKey + i, value })));
        if (Number.isInteger(pos) && pos >= 0 && pos < typed.length)
          setRightKey(nextKey + pos);
        setNextKey((k) => k + typed.length);
      } else if (question) {
        onDone?.();
      } else {
        // Fresh blank builder for the next question.
        setChoices(
          Array.from({ length: START_CHOICES }, (_, key) => ({
            key,
            value: "",
          })),
        );
        setNextKey(START_CHOICES);
        setRightKey(0);
        setVersion((v) => v + 1);
      }
      return result;
    },
    {},
  );
  const v = state.fieldErrors || state.error ? state.values : undefined;
  const id = (name: string) => `${uid}-${name}`;

  return (
    <form key={version} action={action} className="grid gap-5" noValidate>
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      <TextArea
        id={id("prompt")}
        label="Question"
        name="prompt"
        required
        maxLength={2000}
        rows={3}
        defaultValue={v?.prompt ?? question?.prompt}
        error={state.fieldErrors?.prompt}
      />
      <fieldset className="grid gap-3">
        <legend className="mb-1.5 text-[15px] font-medium">Choices</legend>
        <p className="-mt-1 text-[15px] text-ink-2">Tick the right one.</p>
        {choices.map((c, i) => (
          <div key={c.key} className="flex items-center gap-2">
            <label className="flex size-12 shrink-0 cursor-pointer items-center justify-center">
              <input
                type="radio"
                name="correct"
                value={i}
                checked={rightKey === c.key}
                onChange={() => setRightKey(c.key)}
                aria-label={`Choice ${i + 1} is right`}
                className="size-5 accent-[var(--ok)]"
              />
            </label>
            <label htmlFor={id(`choice-${c.key}`)} className="sr-only">
              Choice {i + 1}
            </label>
            <input
              id={id(`choice-${c.key}`)}
              name="choice"
              maxLength={500}
              defaultValue={c.value}
              placeholder={`Choice ${i + 1}`}
              className="step h-12 w-0 min-w-0 flex-1 border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
            />
            {choices.length > MIN_CHOICES ? (
              <button
                type="button"
                onClick={() =>
                  setChoices((list) => {
                    const next = list.filter((x) => x.key !== c.key);
                    if (rightKey === c.key && next[0]) setRightKey(next[0].key);
                    return next;
                  })
                }
                aria-label={`Remove choice ${i + 1}`}
                className="step grid size-12 shrink-0 place-items-center border border-rule-strong text-ink-2 hover:border-ink hover:text-ink"
              >
                <X size={20} strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
        {state.fieldErrors?.choices ? (
          <p className="text-[15px] text-danger">{state.fieldErrors.choices}</p>
        ) : null}
        {state.fieldErrors?.correct ? (
          <p className="text-[15px] text-danger">{state.fieldErrors.correct}</p>
        ) : null}
        {choices.length < MAX_CHOICES ? (
          <button
            type="button"
            onClick={() => {
              setChoices((list) => [...list, { key: nextKey, value: "" }]);
              setNextKey((k) => k + 1);
            }}
            className="caps step inline-flex h-11 items-center gap-2 justify-self-start border border-dashed border-rule-strong px-4 text-[15px] text-ink-2 hover:border-ink hover:text-ink"
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            Add a choice
          </button>
        ) : null}
      </fieldset>
      <Field
        id={id("explanation")}
        label="Explanation"
        name="explanation"
        maxLength={2000}
        defaultValue={v?.explanation ?? question?.explanation}
        error={state.fieldErrors?.explanation}
        hint="Optional. Shown after they answer."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : question ? "Save question" : "Add question"}
        </Button>
        {question && onDone ? (
          <Button
            type="button"
            variant="line"
            onClick={onDone}
            disabled={pending}
          >
            Cancel
          </Button>
        ) : null}
        {!question && state.ok ? (
          <FormMessage tone="ok">{state.ok}</FormMessage>
        ) : null}
      </div>
    </form>
  );
}
