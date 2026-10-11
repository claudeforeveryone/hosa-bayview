"use client";

import {
  startTransition,
  useCallback,
  useOptimistic,
  useRef,
  useState,
} from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { AddQuestions } from "@/components/add-questions";
import type { BuilderQuestion } from "@/components/question-builder";
import { QuestionList, type ListQuestion } from "@/components/question-list";
import { createSaveQueue, type Stuck } from "@/lib/save-queue";

// A question on its way to the database: shown at once, dashed, until the server's list replaces it.
export type NewQuestion = Omit<BuilderQuestion, "id">;
export type AddOneFn = (
  row: NewQuestion,
  send: () => Promise<FormState>,
) => Promise<FormState>;
export type AddManyFn = <R>(
  rows: NewQuestion[],
  send: () => Promise<R>,
) => Promise<R>;

// The test's question list and the add panel share one optimistic list, so a question shows up the moment it is
// added. Saves run one at a time in the order they were made (src/lib/save-queue.ts). A single add that fails
// stays in the list with the reason, later ones wait behind it, and Retry sends them all again in order.
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
  const [stuck, setStuck] = useState<Stuck<NewQuestion>[]>([]);
  const [queue] = useState(() => createSaveQueue<NewQuestion>(setStuck));
  const seq = useRef(0);

  // Optimistic rows for as long as `send` (already queued) takes.
  const show = useCallback(
    <R,>(rows: ListQuestion[], send: () => Promise<R>) =>
      new Promise<R>((resolve, reject) => {
        startTransition(async () => {
          addRows(rows);
          try {
            resolve(await send());
          } catch (e) {
            reject(e);
          }
        });
      }),
    [addRows],
  );

  const addOne = useCallback<AddOneFn>(
    (row, send) => {
      const id = `pending-${++seq.current}`;
      return show([{ ...row, id, pending: true }], () =>
        queue.enqueue(id, row, send),
      );
    },
    [show, queue],
  );

  const addMany = useCallback<AddManyFn>(
    (rows, send) =>
      show(
        rows.map((r) => ({
          ...r,
          id: `pending-${++seq.current}`,
          pending: true,
        })),
        () => queue.after(send),
      ),
    [show, queue],
  );

  const retry = () => {
    for (const s of queue.takeForRetry()) void addOne(s.item, s.send);
  };

  // A kept row replaces its own optimistic copy while the transition finishes.
  const stuckIds = new Set(stuck.map((s) => s.id));
  const shown: ListQuestion[] = [
    ...list.filter((q) => !stuckIds.has(q.id)),
    ...stuck.map((s) => ({ ...s.item, id: s.id, failed: s.error })),
  ];

  return (
    <>
      <section aria-labelledby="questions-h" className="grid gap-5">
        <h3
          id="questions-h"
          tabIndex={-1}
          className="font-display text-28 leading-none font-bold uppercase"
        >
          Questions
        </h3>
        {shown.length ? (
          <QuestionList
            testId={testId}
            questions={shown}
            onRetry={retry}
            onRemove={queue.remove}
          />
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
          className="font-display text-28 leading-none font-bold uppercase"
        >
          Add questions
        </h3>
        <AddQuestions
          testId={testId}
          addOne={addOne}
          addMany={addMany}
          unsaved={stuck.length}
          nextNumber={shown.length + 1}
        />
      </section>
    </>
  );
}
