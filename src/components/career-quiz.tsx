"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  answerCareerQuestion,
  finishCareerQuiz,
  type CareerAnswer,
} from "@/app/(app)/career/actions";
import {
  AnswerChoice,
  choiceState,
  LETTERS,
  VerdictPanel,
} from "@/components/answer-choice";
import { Button } from "@/components/form";
import { feedback } from "@/lib/feedback";

export type QuizItem = {
  question_id: string;
  prompt: string;
  options: string[];
};

type Result = {
  selected: number;
  // Null when the test hides answers from you (such questions never reach a quiz, but the server may say so).
  is_correct: boolean | null;
  correct_index: number | null;
  explanation: string | null;
};

// One question at a time, like a test: pick an option, the server checks it and the key comes back, then Next.
// Each answer is a practice answer on the question's own test (see answerCareerQuestion). When the run ends,
// the practice runs it used are closed so the next quiz starts clean.
export function CareerQuiz({
  items,
  since,
  againHref,
  backHref,
}: {
  items: QuizItem[];
  // When this quiz began, by the server's clock: practice runs opened before it are left alone.
  since: string;
  againHref: string;
  backHref: string;
}) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [skipped, setSkipped] = useState<Record<string, true>>({});
  const [saving, setSaving] = useState(false);
  // The option tapped while its answer is on the way, so the card shows as picked straight away.
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const testIds = useRef(new Set<string>());

  const total = items.length;
  const item = items[index];
  const mine = item ? results[item.question_id] : undefined;
  const isSkipped = item ? skipped[item.question_id] === true : false;
  const answered = mine !== undefined || isSkipped;
  const rightCount = Object.values(results).filter(
    (r) => r.is_correct === true,
  ).length;
  const wrongCount = Object.values(results).filter(
    (r) => r.is_correct === false,
  ).length;
  const skips = Object.keys(skipped).length;

  async function pick(shown: number) {
    if (!item || saving || answered) return;
    setSaving(true);
    setPending(shown);
    setError(null);
    const r: CareerAnswer = await answerCareerQuestion(
      item.question_id,
      shown,
      since,
    ).catch(
      (): CareerAnswer => ({
        error: "That answer didn't save. Check your connection and try again.",
      }),
    );
    setSaving(false);
    setPending(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    if (r.test_id) testIds.current.add(r.test_id);
    const verdict = r.is_correct ?? null;
    setResults((prev) => ({
      ...prev,
      [item.question_id]: {
        selected: r.selected_index ?? shown,
        is_correct: verdict,
        correct_index: r.correct_index ?? null,
        explanation: r.explanation ?? null,
      },
    }));
    if (verdict !== null) feedback(verdict ? "correct" : "wrong");
  }

  function skip() {
    if (!item) return;
    setError(null);
    setSkipped((prev) => ({ ...prev, [item.question_id]: true }));
  }

  async function next() {
    if (index + 1 < total) {
      setIndex((i) => i + 1);
      return;
    }
    setFinished(true);
    // Closing the runs is tidy-up: the answers are already saved, so a failure here doesn't matter to the member.
    void finishCareerQuiz([...testIds.current], since).catch(() => undefined);
  }

  if (finished) {
    return (
      <div className="grid max-w-xl gap-6">
        <p className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-semibold uppercase">
          Quiz done
        </p>
        <p className="num text-18">
          Right: {rightCount} · Wrong: {wrongCount} · Skipped: {skips}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={againHref}
            className="caps step press inline-flex h-12 items-center justify-center bg-ink px-6 text-17 text-ground hover:bg-ink-2"
          >
            Go again
          </Link>
          <Link
            href={backHref}
            className="caps step inline-flex h-12 items-center border border-ink px-6 text-17 hover:bg-band"
          >
            Back to Career
          </Link>
        </div>
      </div>
    );
  }

  if (!item) return null;

  const done = Object.keys(results).length + skips;
  const settled = answered || pending !== null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="caps num text-16 text-ink-2" aria-live="polite">
            Question{" "}
            <span className="font-display text-40 leading-none font-bold text-ink">
              {index + 1}
            </span>{" "}
            of {total}
          </p>
          <p className="caps num flex items-center gap-3 text-16">
            <span className="text-ok">Right {rightCount}</span>
            <span aria-hidden className="h-4 w-px bg-rule-strong" />
            <span className="text-danger">Wrong {wrongCount}</span>
          </p>
        </div>
        <span
          role="progressbar"
          aria-label="Questions done"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="block h-1.5 overflow-hidden bg-rule"
        >
          <span
            className="progress-fill block h-full bg-you-line"
            style={{ transform: `scaleX(${total ? done / total : 0})` }}
          />
        </span>
      </div>

      <section aria-labelledby="quiz-q" className="grid max-w-3xl gap-5">
        <div className="border-t-[3px] border-ink pt-4">
          <p id="quiz-q" className="q-prompt whitespace-pre-line">
            {item.prompt}
          </p>
        </div>
        <ul className="grid gap-2.5">
          {item.options.map((option, shown) => {
            const chosen = mine ? mine.selected === shown : pending === shown;
            const isKey = mine !== undefined && mine.correct_index === shown;
            const wrongPick =
              mine !== undefined && chosen && mine.is_correct === false;
            return (
              <li key={shown}>
                <AnswerChoice
                  letter={LETTERS[shown]}
                  state={choiceState({
                    chosen,
                    right: isKey,
                    wrong: wrongPick,
                    settled,
                  })}
                  picked={chosen}
                  // A quiz never goes back, so every verdict on screen is a fresh one.
                  fresh={mine !== undefined}
                  onClick={() => pick(shown)}
                  aria-pressed={chosen}
                  disabled={answered || saving}
                >
                  {option}
                </AnswerChoice>
              </li>
            );
          })}
        </ul>

        <div className="grid gap-3" aria-live="polite">
          {mine ? (
            <VerdictPanel
              tone={
                mine.is_correct === true
                  ? "ok"
                  : mine.is_correct === false
                    ? "danger"
                    : "wait"
              }
              label={
                mine.is_correct === true
                  ? "Right"
                  : mine.is_correct === false
                    ? "Wrong"
                    : "Saved"
              }
              animate
            >
              {mine.is_correct === false && mine.correct_index !== null ? (
                <p>
                  <span className="text-ink-2">Right answer: </span>
                  <span className="font-semibold">
                    {item.options[mine.correct_index]}
                  </span>
                </p>
              ) : null}
              {mine.explanation ? <p>{mine.explanation}</p> : null}
            </VerdictPanel>
          ) : isSkipped ? (
            <VerdictPanel tone="wait" label="Skipped" />
          ) : (
            <p className="flex min-h-12 items-center text-15 text-ink-2">
              {saving ? "Checking" : "Pick an answer."}
            </p>
          )}
          {error ? (
            <p role="alert" className="text-15 text-danger">
              {error}
            </p>
          ) : null}
        </div>

        {/* Next sits by the thumb on a phone: pinned just above the bottom bar until the page reaches it. */}
        {answered || error ? (
          <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 grid border-t-[3px] border-ink bg-ground px-4 py-3 sm:mx-0 sm:px-0 lg:static lg:mx-0 lg:flex lg:flex-wrap lg:gap-3 lg:border-t-0 lg:p-0">
            {answered ? (
              <Button onClick={next} className="w-full lg:w-auto">
                {index + 1 < total ? "Next" : "See results"}
              </Button>
            ) : (
              <Button
                variant="line"
                onClick={skip}
                className="w-full lg:w-auto"
              >
                Skip this one
              </Button>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
