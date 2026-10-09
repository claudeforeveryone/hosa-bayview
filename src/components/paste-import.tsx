"use client";

import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { importQuestions } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";
import { parseQuestions } from "@/lib/parse/questions";

const LETTERS = "ABCDE";
const EXAMPLE = `1. Which bone is the longest in the body?
A. Humerus
B. Femur
C. Tibia
D. Fibula
Answer: B
Explanation: The femur runs from hip to knee.`;

// Paste past BLC or competition questions; the preview shows exactly what will be saved.
// Tapping an option sets (or fixes) the answer for that question.
export function PasteImport({ testId }: { testId: string }) {
  const [text, setText] = useState("");
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const parsed = useMemo(() => parseQuestions(text), [text]);
  const items = parsed.items.map((q, i) => {
    const correct = picks[i] ?? q.correctIndex;
    const errors = q.errors.filter((e) => !(picks[i] !== undefined && (e.startsWith("No answer") || e.startsWith("Answer "))));
    return { ...q, correct, errors };
  });
  const ready = items.filter((q) => !q.errors.length && q.correct !== null);
  const broken = items.length - ready.length;

  const add = () => {
    setMessage(null);
    start(async () => {
      const result = await importQuestions(
        testId,
        ready.map((q) => ({ prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation })),
      );
      if (result.error) setMessage({ tone: "error", text: result.error });
      else {
        setMessage({ tone: "ok", text: result.ok ?? "Added." });
        setText("");
        setPicks({});
      }
    });
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
          onChange={(e) => {
            setText(e.target.value);
            setPicks({});
            setMessage(null);
          }}
          rows={8}
          placeholder={EXAMPLE}
          spellCheck={false}
          className="step min-h-40 w-full resize-y border border-rule-strong bg-transparent px-3 py-2.5 text-[16px] leading-relaxed outline-none placeholder:text-ink-2/70 focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
        />
      </div>

      {items.length ? (
        <>
          <p className="caps text-[15px] text-ink-2" aria-live="polite">
            {ready.length} ready{broken ? ` · ${broken} to fix` : ""}
            {parsed.ignored ? ` · ${parsed.ignored} line${parsed.ignored === 1 ? "" : "s"} skipped` : ""}
          </p>
          <ol className="grid border-t border-rule">
            {items.map((q, i) => (
              <li key={i} className={`grid gap-2 border-b py-4 ${q.errors.length ? "border-danger" : "border-rule"}`}>
                <p className="flex gap-3">
                  <span className="num shrink-0 font-display text-[20px] font-semibold text-ink-2">{q.number}</span>
                  <span className="whitespace-pre-line">{q.prompt || <em className="text-ink-2">No question text</em>}</span>
                </p>
                <ul className="grid gap-1 pl-8">
                  {q.options.map((o, j) => {
                    const right = q.correct === j;
                    return (
                      <li key={j}>
                        <button
                          type="button"
                          onClick={() => setPicks((p) => ({ ...p, [i]: j }))}
                          aria-pressed={right}
                          className={`step flex w-full items-start gap-2 px-2 py-1 text-left text-[16px] ${
                            right ? "bg-ok/15 font-medium text-ink" : "text-ink-2 hover:bg-band"
                          }`}
                        >
                          <span className="num w-5 shrink-0 font-semibold">{LETTERS[j]}</span>
                          <span className="min-w-0 flex-1">{o || <em>empty</em>}</span>
                          {right ? <Check size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-ok" aria-label="Right answer" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {q.explanation ? <p className="pl-8 text-[15px] text-ink-2">{q.explanation}</p> : null}
                {q.errors.length ? (
                  <p className="pl-8 text-[15px] text-danger">{q.errors.join(" ")}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" onClick={add} disabled={pending || !ready.length}>
          {pending ? "Adding" : ready.length ? `Add ${ready.length} question${ready.length === 1 ? "" : "s"}` : "Add questions"}
        </Button>
        {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      </div>
    </div>
  );
}
