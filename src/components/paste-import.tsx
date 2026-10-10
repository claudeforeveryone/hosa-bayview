"use client";

import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { importQuestions } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";
import type { AddQuestionsFn } from "@/components/questions-editor";
import {
  parseQuestions,
  type ParsedQuestion,
  type SkippedLine,
} from "@/lib/parse/questions";
import {
  IMPORT_BYTES_MAX,
  IMPORT_MAX,
  importBytes,
} from "@/lib/question-rules";

const LETTERS = "ABCDE";
const EXAMPLE = `1. Which bone is the longest in the body?
A. Humerus
B. Femur
C. Tibia
D. Fibula
Answer: B
Explanation: The femur runs from hip to knee.`;

// A pick fixes (or sets) the answer, so the missing or wrong-letter errors go away with it.
function withPick(q: ParsedQuestion, pick: number | undefined) {
  if (pick === undefined) return { correct: q.correctIndex, errors: q.errors };
  return {
    correct: pick,
    errors: q.errors.filter(
      (e) => !e.startsWith("No answer") && !e.startsWith("Answer "),
    ),
  };
}

// Paste a whole past test; the preview below shows, as you type, exactly what will be added and what won't (and
// why). Tapping an option sets or fixes that question's answer. Adding is one call for the whole batch; the
// questions show in the list at once, and anything not added stays in the box to fix.
export function PasteImport({
  testId,
  add,
}: {
  testId: string;
  add: AddQuestionsFn;
}) {
  const [text, setText] = useState("");
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Typing stays smooth on a 300-question paste: the preview catches up between keystrokes.
  const deferred = useDeferredValue(text);
  const stale = deferred !== text;
  const parsed = useMemo(() => parseQuestions(deferred), [deferred]);

  const items = parsed.items.map((q, i) => ({
    q,
    i,
    ...withPick(q, picks[i]),
  }));
  const ready = items.filter((x) => !x.errors.length && x.correct !== null);
  const leftOut = items.length - ready.length;
  const tooMany = ready.length > IMPORT_MAX;

  const pick = useCallback(
    (i: number, j: number) => setPicks((p) => ({ ...p, [i]: j })),
    [],
  );

  // Questions and skipped lines in the order they were pasted.
  const rows = useMemo(
    () =>
      [
        ...parsed.items.map((q, i) => ({ line: q.line, q, i })),
        ...parsed.skipped.map((s) => ({ line: s.line, s })),
      ].sort((a, b) => a.line - b.line),
    [parsed],
  );

  const addAll = () => {
    const sending = ready.map((x) => ({
      prompt: x.q.prompt,
      options: x.q.options,
      correct: x.correct as number,
      explanation: x.q.explanation,
    }));
    if (importBytes(sending) > IMPORT_BYTES_MAX) {
      setMessage({
        tone: "error",
        text: "That's too much text for one go. Add it in two parts.",
      });
      return;
    }
    const before = { text, picks };
    const readySet = new Set(ready.map((x) => x.i));
    // What stays in the box: the questions that weren't ready, as they were typed.
    const leftovers = (keep: Set<number>) =>
      items
        .filter((x) => keep.has(x.i))
        .map((x) => x.q.source)
        .join("\n\n");
    const notReady = new Set(
      items.filter((x) => !readySet.has(x.i)).map((x) => x.i),
    );

    setBusy(true);
    setMessage(null);
    setText(leftovers(notReady));
    setPicks({});
    add(
      ready.map((x) => ({
        prompt: x.q.prompt.trim(),
        options: x.q.options,
        correct_index: x.correct,
        explanation: x.q.explanation,
      })),
      () => importQuestions(testId, sending),
    )
      .then((result) => {
        const added = result.added ?? 0;
        if (result.error && !added) {
          setText(before.text);
          setPicks(before.picks);
          setMessage({ tone: "error", text: result.error });
        } else if (result.error) {
          // Only the old import path stops part way, and it adds in order: the first `added` went in.
          const unsaved = new Set([
            ...notReady,
            ...ready.slice(added).map((x) => x.i),
          ]);
          setText(leftovers(unsaved));
          setMessage({ tone: "error", text: result.error });
        } else {
          setMessage({
            tone: "ok",
            text: `Added ${added} question${added === 1 ? "" : "s"}.${notReady.size ? ` ${notReady.size} left below to fix.` : ""}`,
          });
        }
      })
      .catch(() => {
        setText(before.text);
        setPicks(before.picks);
        setMessage({
          tone: "error",
          text: "That didn't save. Check your connection and try again.",
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <label htmlFor="paste-text" className="text-[15px] font-medium">
          Paste questions
        </label>
        <textarea
          id="paste-text"
          value={text}
          readOnly={busy}
          onChange={(e) => {
            setText(e.target.value);
            setPicks({});
            setMessage(null);
          }}
          rows={8}
          placeholder={EXAMPLE}
          spellCheck={false}
          aria-describedby="paste-summary"
          className="step min-h-40 w-full resize-y border border-rule-strong bg-transparent px-3 py-2.5 text-[16px] leading-relaxed outline-none placeholder:text-ink-2/70 focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button
          type="button"
          onClick={addAll}
          disabled={busy || stale || !ready.length || tooMany}
        >
          {busy
            ? "Adding"
            : ready.length
              ? `Add ${ready.length} question${ready.length === 1 ? "" : "s"}`
              : "Add questions"}
        </Button>
        <p
          id="paste-summary"
          className={`caps num text-[15px] text-ink-2 ${stale ? "opacity-60" : ""}`}
          aria-live="polite"
        >
          {items.length || parsed.skipped.length
            ? [
                `${ready.length} ready`,
                leftOut ? `${leftOut} left out` : "",
                parsed.skipped.length
                  ? `${parsed.skipped.length} line${parsed.skipped.length === 1 ? "" : "s"} skipped`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : ""}
        </p>
      </div>
      {tooMany ? (
        <FormMessage tone="error">{`${IMPORT_MAX} at a time. Paste the rest after.`}</FormMessage>
      ) : null}
      {message ? (
        <FormMessage tone={message.tone}>{message.text}</FormMessage>
      ) : null}

      {rows.length ? (
        <ol
          aria-label="Preview"
          className={`grid border-t border-rule ${stale ? "opacity-60" : ""}`}
        >
          {rows.map((r, n) =>
            "q" in r ? (
              <PreviewQuestion
                key={`q${r.line}`}
                index={r.i}
                q={r.q}
                pick={picks[r.i]}
                onPick={pick}
              />
            ) : (
              <PreviewSkipped key={`s${r.line}-${n}`} s={r.s} />
            ),
          )}
        </ol>
      ) : null}
    </div>
  );
}

// One parsed question, compact. Memoized so tapping an answer re-renders only its own row.
const PreviewQuestion = memo(function PreviewQuestion({
  q,
  index,
  pick,
  onPick,
}: {
  q: ParsedQuestion;
  index: number;
  pick: number | undefined;
  onPick: (i: number, j: number) => void;
}) {
  const { correct, errors } = withPick(q, pick);
  const broken = errors.length > 0 || correct === null;
  return (
    <li
      className={`grid gap-2 border-b py-3 ${broken ? "border-danger" : "border-rule"}`}
    >
      <div className="flex gap-3">
        <span className="num w-8 shrink-0 font-display text-[18px] leading-snug font-semibold text-ink-2">
          {q.number}
        </span>
        <p className="min-w-0 flex-1 text-[16px] whitespace-pre-line [overflow-wrap:anywhere]">
          {q.prompt || <em className="text-ink-2">No question text</em>}
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5 pl-11">
        {q.options.map((o, j) => {
          const right = correct === j;
          return (
            <li key={j} className="max-w-full">
              <button
                type="button"
                onClick={() => onPick(index, j)}
                aria-pressed={right}
                aria-label={`${LETTERS[j]}: ${o || "empty"}${right ? ", right answer" : ""}`}
                className={`step flex min-h-10 max-w-full items-center gap-1.5 border px-2 py-1 text-left text-[15px] ${
                  right
                    ? "border-ok bg-ok/15 font-medium text-ink"
                    : "border-rule text-ink-2 hover:border-ink hover:text-ink"
                }`}
              >
                <span className="num font-semibold">{LETTERS[j]}</span>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {o || <em>empty</em>}
                </span>
                {right ? (
                  <Check
                    size={16}
                    strokeWidth={2.25}
                    className="shrink-0 text-ok"
                    aria-hidden
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {q.explanation ? (
        <p className="line-clamp-2 pl-11 text-[15px] text-ink-2">
          {q.explanation}
        </p>
      ) : null}
      {broken ? (
        <p className="pl-11 text-[15px] text-danger">
          Left out. {errors.join(" ")}
        </p>
      ) : null}
    </li>
  );
});

// A line that belongs to no question: struck through, with why.
function PreviewSkipped({ s }: { s: SkippedLine }) {
  return (
    <li className="grid gap-0.5 border-b border-dashed border-rule-strong py-2 pl-11 text-[15px]">
      <span className="text-ink-2 line-through decoration-rule-strong [overflow-wrap:anywhere]">
        {s.text}
      </span>
      <span className="text-ink">
        Skipped, line <span className="num">{s.line}</span>. {s.reason}.
      </span>
    </li>
  );
}
