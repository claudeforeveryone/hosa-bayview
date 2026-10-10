"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type KeyboardEvent,
} from "react";
import { Plus, X } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { saveQuestion } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";
import type { AddQuestionsFn } from "@/components/questions-editor";
import { choiceKey, isSaveKey, markKey } from "@/lib/question-keys";
import { MAX_CHOICES, MIN_CHOICES, checkQuestion } from "@/lib/question-rules";

export type BuilderQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number | null;
  explanation: string;
};

const START_CHOICES = 4;
const LETTERS = "ABCDE";
const INPUT =
  "step w-full border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-danger";

type Choice = { key: number; value: string };
type Draft = {
  prompt: string;
  choices: Choice[];
  rightKey: number;
  explanation: string;
};
type Errors = FormState["fieldErrors"];

const blank = (): Draft => ({
  prompt: "",
  choices: Array.from({ length: START_CHOICES }, (_, key) => ({
    key,
    value: "",
  })),
  rightKey: 0,
  explanation: "",
});

const isBlank = (d: Draft) =>
  !d.prompt.trim() &&
  !d.explanation.trim() &&
  d.choices.every((c) => !c.value.trim());

// Mac keyboards show Cmd and Option; read after hydration so the server and first paint agree.
const subscribe = () => () => {};
function useIsMac() {
  return useSyncExternalStore(
    subscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
}

// Type the question, then the choices, and mark which one is right. Keyboard first: Enter walks down the
// choices, Alt or Option plus a number marks the right one, Ctrl or Cmd plus Enter saves. A new question clears
// the form and shows in the list at once; the save runs behind it.
export function QuestionBuilder({
  testId,
  question,
  onDone,
  add,
  nextNumber,
}: {
  testId: string;
  question?: BuilderQuestion;
  onDone?: () => void;
  add?: AddQuestionsFn;
  nextNumber?: number;
}) {
  const uid = useId();
  const isMac = useIsMac();
  const [draft, setDraft] = useState<Draft>(() =>
    question
      ? {
          prompt: question.prompt,
          choices: question.options.map((value, key) => ({ key, value })),
          rightKey: question.correct_index ?? 0,
          explanation: question.explanation,
        }
      : blank(),
  );
  const nextKey = useRef(draft.choices.length);
  const [errors, setErrors] = useState<Errors>(undefined);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [failed, setFailed] = useState<Draft | null>(null);
  const [saving, startSaving] = useTransition();

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const explanationRef = useRef<HTMLInputElement>(null);
  const choiceRefs = useRef(new Map<number, HTMLInputElement>());
  const markRefs = useRef(new Map<number, HTMLButtonElement>());
  const focusKey = useRef<number | "prompt" | null>(null);
  const id = (name: string) => `${uid}-${name}`;

  // The draft as of the last render, for a save that fails after the form has moved on.
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  });

  // Focus moves after the render that created or removed the row.
  useEffect(() => {
    const target = focusKey.current;
    focusKey.current = null;
    if (target === "prompt") promptRef.current?.focus();
    else if (target !== null) choiceRefs.current.get(target)?.focus();
  });

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const setChoice = (key: number, value: string) =>
    setDraft((d) => ({
      ...d,
      choices: d.choices.map((c) => (c.key === key ? { ...c, value } : c)),
    }));

  const addChoice = () => {
    if (draft.choices.length >= MAX_CHOICES) return;
    const key = nextKey.current++;
    focusKey.current = key;
    setDraft((d) => ({ ...d, choices: [...d.choices, { key, value: "" }] }));
  };

  const removeChoice = (key: number, focusAfter?: number) => {
    setDraft((d) => {
      const choices = d.choices.filter((c) => c.key !== key);
      return {
        ...d,
        choices,
        rightKey: d.rightKey === key ? choices[0].key : d.rightKey,
      };
    });
    if (focusAfter !== undefined) focusKey.current = focusAfter;
  };

  const mark = (i: number) => {
    const c = draft.choices[i];
    if (c) update({ rightKey: c.key });
  };

  const restore = (d: Draft) => {
    nextKey.current = Math.max(
      nextKey.current,
      ...d.choices.map((c) => c.key + 1),
    );
    setDraft(d);
    setFailed(null);
    focusKey.current = "prompt";
  };

  const submit = () => {
    const correct = draft.choices.findIndex((c) => c.key === draft.rightKey);
    const input = {
      prompt: draft.prompt,
      choices: draft.choices.map((c) => c.value),
      correct,
      explanation: draft.explanation,
    };
    const problems = checkQuestion(input);
    if (Object.keys(problems).length) {
      setErrors(problems);
      setMessage(null);
      if (problems.prompt) promptRef.current?.focus();
      else if (problems.choices)
        choiceRefs.current
          .get(
            draft.choices.find((c) => !c.value.trim())?.key ??
              draft.choices[0].key,
          )
          ?.focus();
      else if (problems.explanation) explanationRef.current?.focus();
      return;
    }
    setErrors(undefined);
    const form = new FormData();
    form.set("prompt", input.prompt);
    for (const c of input.choices) form.append("choice", c);
    form.set("correct", String(correct));
    form.set("explanation", input.explanation);

    if (question) {
      startSaving(async () => {
        const result = await saveQuestion(testId, question.id, {}, form);
        if (result.fieldErrors || result.error) {
          setErrors(result.fieldErrors);
          setMessage(
            result.error ? { tone: "error", text: result.error } : null,
          );
        } else onDone?.();
      });
      return;
    }

    // New question: clear at once, show it in the list, save behind it.
    const sent = draft;
    const number = nextNumber;
    nextKey.current = START_CHOICES;
    setDraft(blank());
    setFailed(null);
    setMessage(null);
    focusKey.current = "prompt";
    const row = {
      prompt: input.prompt.trim(),
      options: input.choices.map((c) => c.trim()),
      correct_index: correct,
      explanation: input.explanation.trim(),
    };
    const send = () => saveQuestion(testId, null, {}, form);
    const fail = (text: string) => {
      setMessage({ tone: "error", text });
      // Put it straight back if nothing new was typed; otherwise keep it one tap away.
      if (isBlank(latest.current)) restore(sent);
      else setFailed(sent);
    };
    (add ? add([row], send) : send())
      .then((result) => {
        if (result.error || result.fieldErrors)
          fail(
            result.error ??
              Object.values(result.fieldErrors ?? {})[0] ??
              "That didn't save. Try again.",
          );
        else
          setMessage({
            tone: "ok",
            text: number ? `Added question ${number}.` : "Added.",
          });
      })
      .catch(() =>
        fail("That didn't save. Check your connection and try again."),
      );
  };

  const onFormKey = (e: KeyboardEvent<HTMLFormElement>) => {
    if (isSaveKey(e)) {
      e.preventDefault();
      submit();
      return;
    }
    const onMark = (e.target as HTMLElement).dataset?.mark !== undefined;
    const i = markKey(e, { count: draft.choices.length, onMark });
    if (i !== null) {
      e.preventDefault();
      mark(i);
    }
  };

  const onMarkKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if (!step) return;
    const to = draft.choices[index + step];
    e.preventDefault();
    if (!to) return;
    update({ rightKey: to.key });
    markRefs.current.get(to.key)?.focus();
  };

  const onChoiceKey = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    const c = draft.choices[index];
    const action = choiceKey(e, {
      index,
      count: draft.choices.length,
      value: c.value,
    });
    if (!action) return;
    e.preventDefault();
    if (action === "next")
      choiceRefs.current.get(draft.choices[index + 1].key)?.focus();
    else if (action === "add") addChoice();
    else if (action === "explanation") explanationRef.current?.focus();
    else if (action === "remove") {
      const neighbour = draft.choices[index - 1] ?? draft.choices[index + 1];
      removeChoice(c.key, neighbour?.key);
    }
  };

  const save = isMac ? "⌘ Enter" : "Ctrl+Enter";
  const alt = isMac ? "⌥" : "Alt+";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={onFormKey}
      className="grid gap-5"
      noValidate
    >
      <div className="grid gap-1.5">
        <label htmlFor={id("prompt")} className="text-[15px] font-medium">
          Question
        </label>
        <textarea
          ref={promptRef}
          id={id("prompt")}
          value={draft.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
          maxLength={2000}
          rows={3}
          aria-invalid={errors?.prompt ? true : undefined}
          aria-describedby={errors?.prompt ? id("prompt-err") : undefined}
          className={`${INPUT} min-h-28 resize-y py-2.5`}
        />
        {errors?.prompt ? (
          <p id={id("prompt-err")} className="text-[15px] text-danger">
            {errors.prompt}
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-[15px] font-medium">Choices</legend>
        <p className="-mt-0.5 mb-1 text-[15px] text-ink-2">
          Tap the letter of the right one.
        </p>
        {draft.choices.map((c, i) => {
          const right = c.key === draft.rightKey;
          return (
            <div key={c.key} className="flex items-center gap-2">
              <button
                type="button"
                data-mark=""
                ref={(el) => {
                  if (el) markRefs.current.set(c.key, el);
                  else markRefs.current.delete(c.key);
                }}
                onClick={() => mark(i)}
                onKeyDown={(e) => onMarkKey(e, i)}
                // One tab stop for the set, like radio buttons: the right one. Arrows move it.
                tabIndex={right ? 0 : -1}
                aria-pressed={right}
                aria-label={`${LETTERS[i]} is right`}
                className={`caps step grid size-12 shrink-0 place-items-center border text-[18px] ${
                  right
                    ? "border-ok bg-ok text-ground"
                    : "border-rule-strong text-ink-2 hover:border-ink hover:text-ink"
                }`}
              >
                {LETTERS[i]}
              </button>
              <label htmlFor={id(`choice-${c.key}`)} className="sr-only">
                Choice {LETTERS[i]}
              </label>
              <input
                ref={(el) => {
                  if (el) choiceRefs.current.set(c.key, el);
                  else choiceRefs.current.delete(c.key);
                }}
                id={id(`choice-${c.key}`)}
                value={c.value}
                onChange={(e) => setChoice(c.key, e.target.value)}
                onKeyDown={(e) => onChoiceKey(e, i)}
                maxLength={500}
                enterKeyHint={
                  i < draft.choices.length - 1 ||
                  draft.choices.length < MAX_CHOICES
                    ? "next"
                    : "done"
                }
                aria-invalid={
                  errors?.choices && !c.value.trim() ? true : undefined
                }
                className={`${INPUT} h-12 w-0 min-w-0 flex-1`}
              />
              {draft.choices.length > MIN_CHOICES ? (
                <button
                  type="button"
                  onClick={() => removeChoice(c.key)}
                  // Pointer only; from the keyboard, Backspace in an empty choice removes it.
                  tabIndex={-1}
                  aria-label={`Remove choice ${LETTERS[i]}`}
                  className="step grid size-12 shrink-0 place-items-center border border-rule-strong text-ink-2 hover:border-ink hover:text-ink"
                >
                  <X size={20} strokeWidth={1.75} aria-hidden />
                </button>
              ) : null}
            </div>
          );
        })}
        {errors?.choices ? (
          <p className="text-[15px] text-danger">{errors.choices}</p>
        ) : null}
        {errors?.correct ? (
          <p className="text-[15px] text-danger">{errors.correct}</p>
        ) : null}
        {draft.choices.length < MAX_CHOICES ? (
          <button
            type="button"
            onClick={addChoice}
            className="caps step mt-1 inline-flex h-11 items-center gap-2 justify-self-start border border-dashed border-rule-strong px-4 text-[15px] text-ink-2 hover:border-ink hover:text-ink"
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            Add a choice
          </button>
        ) : null}
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor={id("explanation")} className="text-[15px] font-medium">
          Explanation
        </label>
        <input
          ref={explanationRef}
          id={id("explanation")}
          value={draft.explanation}
          onChange={(e) => update({ explanation: e.target.value })}
          maxLength={2000}
          enterKeyHint="done"
          aria-invalid={errors?.explanation ? true : undefined}
          aria-describedby={id("explanation-note")}
          className={`${INPUT} h-12`}
        />
        <p
          id={id("explanation-note")}
          className={`text-[15px] ${errors?.explanation ? "text-danger" : "text-ink-2"}`}
        >
          {errors?.explanation ?? "Optional. Shown after they answer."}
        </p>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving" : question ? "Save question" : "Add question"}
          </Button>
          {question && onDone ? (
            <Button
              type="button"
              variant="line"
              onClick={onDone}
              disabled={saving}
            >
              Cancel
            </Button>
          ) : null}
          {failed ? (
            <Button
              type="button"
              variant="line"
              onClick={() => restore(failed)}
            >
              Put it back
            </Button>
          ) : null}
        </div>
        <div aria-live="polite" className="empty:hidden">
          {message ? (
            <FormMessage tone={message.tone}>{message.text}</FormMessage>
          ) : null}
        </div>
        <p className="hidden text-[15px] text-ink-2 sm:block">
          <Kbd>Enter</Kbd> next choice · <Kbd>{`${alt}1`}</Kbd> to <Kbd>{`${alt}5`}</Kbd>{" "}
          marks it right · <Kbd>{save}</Kbd> {question ? "saves" : "adds"}
        </p>
      </div>
    </form>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="num border border-rule px-1.5 py-px font-sans text-[14px] text-ink">
      {children}
    </kbd>
  );
}
