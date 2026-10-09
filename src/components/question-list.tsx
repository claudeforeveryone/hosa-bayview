"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { deleteQuestion } from "@/app/(app)/c/[id]/tests/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { QuestionBuilder, type BuilderQuestion } from "@/components/question-builder";

export function QuestionList({ testId, questions }: { testId: string; questions: BuilderQuestion[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <ol className="border-t border-rule">
      {questions.map((q, i) => (
        <li key={q.id} id={`q-${q.id}`} className="grid gap-3 border-b border-rule py-5">
          {editing === q.id ? (
            <QuestionBuilder testId={testId} question={q} onDone={() => setEditing(null)} />
          ) : (
            <>
              <div className="flex items-start gap-3">
                <span className="num w-8 shrink-0 font-display text-[22px] leading-tight font-semibold text-ink-2">{i + 1}</span>
                <p className="min-w-0 flex-1 text-[17px] whitespace-pre-line">{q.prompt}</p>
              </div>
              <ul className="grid gap-1 pl-11">
                {q.options.map((o, j) => {
                  const right = j === q.correct_index;
                  return (
                    <li key={j} className={`flex items-start gap-2 text-[16px] ${right ? "font-medium" : "text-ink-2"}`}>
                      {right ? (
                        <Check size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-ok" aria-label="Right answer" />
                      ) : (
                        <span className="w-[18px] shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0">{o}</span>
                    </li>
                  );
                })}
              </ul>
              {q.explanation ? <p className="pl-11 text-[15px] text-ink-2">{q.explanation}</p> : null}
              <div className="flex flex-wrap items-start gap-2 pl-11">
                <button
                  type="button"
                  onClick={() => setEditing(q.id)}
                  className="caps step inline-flex h-10 items-center gap-2 border border-ink px-4 text-[15px] hover:bg-band"
                >
                  <Pencil size={16} strokeWidth={1.75} aria-hidden />
                  Edit
                </button>
                <ConfirmAction
                  action={() => deleteQuestion(q.id)}
                  label="Delete"
                  confirmLabel="Delete it"
                  pendingLabel="Deleting"
                  question={`Delete question ${i + 1}?`}
                  compact
                  focusAfter="questions-h"
                />
              </div>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
