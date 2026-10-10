"use client";

import { startTransition, useCallback, useOptimistic, useRef } from "react";
import { AddQuestions } from "@/components/add-questions";
import type { BuilderQuestion } from "@/components/question-builder";
import { QuestionList, type ListQuestion } from "@/components/question-list";

// A question on its way to the database: shown at once, dashed, until the server's list replaces it.
export type NewQuestion = Omit<BuilderQuestion, "id">;
export type AddQuestionsFn = <R>(
  rows: NewQuestion[],
  send: () => Promise<R>,
) => Promise<R>;

// The test's question list and the add panel share one optimistic list, so a question shows up the moment it is
// added. Saves run one after another, in the order they were made, so positions never collide.
export function QuestionsEditor({
  testId,
  questions,
}: {
  testId: string;
  questions: BuilderQuestion[];
}) {
  const [list, addRows] = useOptimistic<ListQuestion[], ListQuestion[]>(
    questions,
    (current, rows) => [...current, ...rows],
  );
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const seq = useRef(0);

  const add = useCallback<AddQuestionsFn>(
    (rows, send) =>
      new Promise((resolve, reject) => {
        startTransition(async () => {
          addRows(
            rows.map((r) => ({
              ...r,
              id: `pending-${++seq.current}`,
              pending: true,
            })),
          );
          const run = queue.current.then(send, send);
          queue.current = run.catch(() => undefined);
          try {
            resolve(await run);
          } catch (e) {
            reject(e);
          }
        });
      }),
    [addRows],
  );

  return (
    <>
      <section aria-labelledby="questions-h" className="grid gap-5">
        <h3
          id="questions-h"
          tabIndex={-1}
          className="font-display text-[28px] leading-none font-bold uppercase"
        >
          Questions
        </h3>
        {list.length ? (
          <QuestionList testId={testId} questions={list} />
        ) : (
          <p className="text-ink-2">None yet.</p>
        )}
      </section>

      <section
        aria-labelledby="add-h"
        className="grid max-w-2xl gap-5 bg-band px-4 py-6 sm:px-6"
      >
        <h3
          id="add-h"
          className="font-display text-[28px] leading-none font-bold uppercase"
        >
          Add questions
        </h3>
        <AddQuestions testId={testId} add={add} nextNumber={list.length + 1} />
      </section>
    </>
  );
}
