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
import type { AddOneFn } from "@/components/questions-editor";
import {
  altDigitsReachPage,
  choiceKey,
  isSaveKey,
  markKey,
} from "@/lib/question-keys";
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
  "step w-full border border-rule-strong bg-transparent px-3 text-17 outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-danger";

type Choice = { key: number; value: string };
// rightKey is null until the trainer marks one: there is no default right answer.
type Draft = {
  prompt: string;
  choices: Choice[];
  rightKey: number | null;
  explanation: string;
};
type Errors = FormState["fieldErrors"];

const blank = (): Draft => ({
  prompt: "",
  choices: Array.from({ length: START_CHOICES }, (_, key) => ({
    key,
    value: "",
  })),
  rightKey: null,
  explanation: "",
});

// Keyboard names for this device, read after hydration so the server and first paint agree.
type Keys = { mac: boolean; altDigits: boolean };
const SERVER_KEYS = JSON.stringify({ mac: false, altDigits: false });
const subscribe = () => () => {};
function useKeys(): Keys {
  const raw = useSyncExternalStore(
    subscribe,
    () =>
      JSON.stringify({
        mac: /Mac|iPhone|iPad/.test(navigator.platform),
        altDigits: altDigitsReachPage(navigator.userAgent),
      }),
    () => SERVER_KEYS,
  );
  return JSON.parse(raw) as Keys;
}

// Type the question, then the choices, and mark which one is right. Keyboard first: Enter walks down the
// choices, a number on the letters (or Alt or Option plus a number where the device allows it) marks the right
// one, Ctrl or Cmd plus Enter saves. A new question clears the form and shows in the list at once; the save runs
// behind it, and a failed save stays in the list to retry (src/components/questions-editor.tsx).
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
  add?: AddOneFn;
  nextNumber?: number;
}) {
  const uid = useId();
  const keys = useKeys();
  const [draft, setDraft] = useState<Draft>(() =>
    question
      ? {
          prompt: question.prompt,
          choices: question.options.map((value, key) => ({ key, value })),
          rightKey: question.correct_index,
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
  const [saving, startSaving] = useTransition();
  const [focused, setFocused] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const explanationRef = useRef<HTMLInputElement>(null);
  const choiceRefs = useRef(new Map<number, HTMLInputElement>());
  const markRefs = useRef(new Map<number, HTMLButtonElement>());
  const focusKey = useRef<number | "prompt" | null>(null);
  const id = (name: string) => `${uid}-${name}`;

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

  // Removing the marked choice clears the mark; it never moves to another choice by itself.
  const removeChoice = (key: number, focusAfter?: number) => {
    setDraft((d) => ({
      ...d,
      choices: d.choices.filter((c) => c.key !== key),
      rightKey: d.rightKey === key ? null : d.rightKey,
    }));
    if (focusAfter !== undefined) focusKey.current = focusAfter;
  };

  const mark = (i: number) => {
    const c = draft.choices[i];
    if (!c) return;
    update({ rightKey: c.key });
    setErrors((e) => (e?.correct ? { ...e, correct: "" } : e));
  };

  const unmarked =
    draft.rightKey === null ||
    !draft.choices.some((c) => c.key === draft.rightKey);

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
      else if (problems.correct)
        markRefs.current.get(draft.choices[0].key)?.focus();
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
    const number = nextNumber;
    nextKey.current = START_CHOICES;
    setDraft(blank());
    setMessage(null);
    focusKey.current = "prompt";
    const row = {
      prompt: input.prompt.trim(),
      options: input.choices.map((c) => c.trim()),
      correct_index: correct,
      explanation: input.explanation.trim(),
    };
    const send = () => saveQuestion(testId, null, {}, form);
    (add ? add(row, send) : send())
      .then((result) => {
        if (result.error || result.fieldErrors)
          setMessage({
            tone: "error",
            text: `${number ? `Question ${number}` : "That question"} didn't save. It's kept in the list to retry.`,
          });
        else
          setMessage({
            tone: "ok",
            text: number ? `Added question ${number}.` : "Added.",
          });
      })
      .catch(() =>
        setMessage({
          tone: "error",
          text: "That didn't save. Check your connection and try again.",
        }),
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
      markRefs.current.get(draft.choices[i].key)?.focus();
    }
  };

  const onMarkKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[
      e.key
    ];
    if (!step) return;
    e.preventDefault();
    const to = draft.choices[index + step];
    if (!to) return;
    mark(index + step);
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

  const save = keys.mac ? "⌘ Enter" : "Ctrl+Enter";
  const alt = keys.mac ? "⌥" : "Alt+";
  // One tab stop for the letters, like radio buttons: the marked one, or A before anything is marked.
  const tabStop = unmarked ? draft.choices[0]?.key : draft.rightKey;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={onFormKey}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setFocused(false);
      }}
      className="grid gap-5"
      noValidate
    >
      <div className="grid gap-1.5">
        <label htmlFor={id("prompt")} className="text-15 font-medium">
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
          <p id={id("prompt-err")} className="text-15 text-danger">
            {errors.prompt}
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-15 font-medium">Choices</legend>
        <p id={id("mark-hint")} className="-mt-0.5 mb-1 text-15 text-ink-2">
          Tap the letter of the right one.
        </p>
        <div
          role="radiogroup"
          aria-labelledby={id("mark-hint")}
          aria-invalid={errors?.correct ? true : undefined}
          className="grid gap-2"
        >
          {draft.choices.map((c, i) => {
            const right = c.key === draft.rightKey;
            return (
              <div key={c.key} className="flex items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  data-mark=""
                  ref={(el) => {
                    if (el) markRefs.current.set(c.key, el);
                    else markRefs.current.delete(c.key);
                  }}
                  onClick={() => mark(i)}
                  onKeyDown={(e) => onMarkKey(e, i)}
                  tabIndex={c.key === tabStop ? 0 : -1}
                  aria-checked={right}
                  aria-label={`${LETTERS[i]}: ${c.value.trim() || "empty choice"}`}
                  className={`caps step grid size-12 shrink-0 place-items-center border text-18 ${
                    right
                      ? "border-ok bg-ok text-ground"
                      : `${errors?.correct ? "border-danger" : "border-rule-strong"} text-ink-2 hover:border-ink hover:text-ink`
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
        </div>
        {errors?.choices ? (
          <p className="text-15 text-danger">{errors.choices}</p>
        ) : null}
        {errors?.correct ? (
          <p className="text-15 text-danger">{errors.correct}</p>
        ) : null}
        {draft.choices.length < MAX_CHOICES ? (
          <button
            type="button"
            onClick={addChoice}
            className="caps step mt-1 inline-flex h-11 items-center gap-2 justify-self-start border border-rule-strong px-4 text-15 text-ink-2 hover:border-ink hover:text-ink"
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            Add a choice
          </button>
        ) : null}
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor={id("explanation")} className="text-15 font-medium">
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
          className={`text-15 ${errors?.explanation ? "text-danger" : "text-ink-2"}`}
        >
          {errors?.explanation ?? "Optional. Shown after they answer."}
        </p>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={saving || unmarked}
            aria-describedby={unmarked ? id("why-off") : undefined}
          >
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
          {unmarked ? (
            <p id={id("why-off")} className="text-15 text-ink-2">
              Mark the right answer first.
            </p>
          ) : null}
        </div>
        <div aria-live="polite" className="empty:hidden">
          {message ? (
            <FormMessage tone={message.tone}>{message.text}</FormMessage>
          ) : null}
        </div>
        {focused ? (
          <p className="hidden text-15 text-ink-2 sm:block">
            <Kbd>Enter</Kbd> next choice · <Kbd>1</Kbd> to <Kbd>5</Kbd> on a
            letter marks it
            {keys.altDigits ? (
              <>
                {" "}
                (<Kbd>{`${alt}1`}</Kbd> from anywhere)
              </>
            ) : null}{" "}
            · <Kbd>{save}</Kbd> {question ? "saves" : "adds"}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="num border border-rule px-1.5 py-px font-sans text-14 text-ink">
      {children}
    </kbd>
  );
}
