"use client";

import { useActionState, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { saveQuestion } from "@/app/(app)/c/[id]/tests/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";

export type BuilderQuestion = { id: string; prompt: string; options: string[]; correct_index: number | null; explanation: string };

const MAX_WRONG = 4;

function split(q?: BuilderQuestion) {
  if (!q) return { right: "", others: ["", "", ""] };
  const correct = q.correct_index ?? 0;
  return { right: q.options[correct] ?? "", others: q.options.filter((_, i) => i !== correct) };
}

// Type the question, the right answer, then the wrong choices. Choices are shuffled for students.
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
  const start = split(question);
  const [others, setOthers] = useState<{ key: number; value: string }[]>(() =>
    start.others.map((value, key) => ({ key, value })),
  );
  const [nextKey, setNextKey] = useState(start.others.length);
  const [version, setVersion] = useState(0);

  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await saveQuestion(testId, question?.id ?? null, prev, form);
    if (result.fieldErrors || result.error) {
      // The form resets after an action; put the typed wrong choices back.
      const typed = form.getAll("other").map(String);
      setOthers(typed.map((value, i) => ({ key: nextKey + i, value })));
      setNextKey((k) => k + typed.length);
    } else {
      if (question) onDone?.();
      else {
        // Fresh blank builder for the next question.
        setOthers(["", "", ""].map((value, key) => ({ key, value })));
        setNextKey(3);
        setVersion((v) => v + 1);
      }
    }
    return result;
  }, {});
  const v = state.fieldErrors || state.error ? state.values : undefined;
  const id = (name: string) => `${uid}-${name}`;

  return (
    <form key={version} action={action} className="grid gap-5" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
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
      <Field
        id={id("right")}
        label="Right answer"
        name="right"
        required
        maxLength={500}
        defaultValue={v?.right ?? start.right}
        error={state.fieldErrors?.right}
        className="step h-12 w-full border border-ok bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-danger"
      />
      <fieldset className="grid gap-3">
        <legend className="mb-1.5 text-[15px] font-medium">Wrong choices</legend>
        {others.map((o, i) => (
          <div key={o.key} className="flex gap-2">
            <label htmlFor={id(`other-${o.key}`)} className="sr-only">
              Wrong choice {i + 1}
            </label>
            <input
              id={id(`other-${o.key}`)}
              name="other"
              maxLength={500}
              defaultValue={o.value}
              placeholder={`Wrong choice ${i + 1}`}
              className="step h-12 w-0 min-w-0 flex-1 border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
            />
            {others.length > 1 ? (
              <button
                type="button"
                onClick={() => setOthers((list) => list.filter((x) => x.key !== o.key))}
                aria-label={`Remove wrong choice ${i + 1}`}
                className="step grid size-12 shrink-0 place-items-center border border-rule-strong text-ink-2 hover:border-ink hover:text-ink"
              >
                <X size={20} strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
        {state.fieldErrors?.others ? <p className="text-[15px] text-danger">{state.fieldErrors.others}</p> : null}
        {others.length < MAX_WRONG ? (
          <button
            type="button"
            onClick={() => {
              setOthers((list) => [...list, { key: nextKey, value: "" }]);
              setNextKey((k) => k + 1);
            }}
            className="caps step inline-flex h-11 items-center gap-2 justify-self-start border border-dashed border-rule-strong px-4 text-[15px] text-ink-2 hover:border-ink hover:text-ink"
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            Add a choice
          </button>
        ) : null}
      </fieldset>
      <TextArea
        id={id("explanation")}
        label="Explanation"
        name="explanation"
        maxLength={2000}
        rows={2}
        defaultValue={v?.explanation ?? question?.explanation}
        error={state.fieldErrors?.explanation}
        hint="Optional. Shown after they answer."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : question ? "Save question" : "Add question"}
        </Button>
        {question && onDone ? (
          <Button type="button" variant="line" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        {!question && state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
