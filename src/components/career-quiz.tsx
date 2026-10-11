"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  answerCareerQuestion,
  finishCareerQuiz,
  type CareerAnswer,
} from "@/app/(app)/career/actions";
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

const LETTERS = "ABCDE";

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
    setError(null);
    const r: CareerAnswer = await answerCareerQuestion(
      item.question_id,
      shown,
      since,
    ).catch((): CareerAnswer => ({
      error: "That answer didn't save. Check your connection and try again.",
    }));
    setSaving(false);
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
        <p className="num text-[18px]">
          Right: {rightCount} · Wrong: {wrongCount} · Skipped: {skips}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={againHref}
            className="caps step press inline-flex h-12 items-center justify-center bg-ink px-6 text-[17px] text-ground hover:bg-ink-2"
          >
            Go again
          </Link>
          <Link
            href={backHref}
            className="caps step inline-flex h-12 items-center border border-ink px-6 text-[17px] hover:bg-band"
          >
            Back to Career
          </Link>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="caps num text-[16px] text-ink-2" aria-live="polite">
          Question {index + 1} of {total}
        </p>
        <p className="caps num text-[16px] text-ink-2">
          Right {rightCount} · Wrong {wrongCount}
        </p>
      </div>

      <section aria-labelledby="quiz-q" className="grid gap-5">
        <p
          id="quiz-q"
          className="max-w-[65ch] text-[clamp(1.25rem,4vw,1.6rem)] leading-snug font-medium whitespace-pre-line"
        >
          {item.prompt}
        </p>
        <ul className="grid max-w-2xl gap-2">
          {item.options.map((option, shown) => {
            const chosen = mine?.selected === shown;
            const isKey = mine !== undefined && mine.correct_index === shown;
            const wrongPick =
              mine !== undefined && chosen && mine.is_correct === false;
            const tone = isKey
              ? "border-ok bg-ok/15"
              : wrongPick
                ? "border-danger bg-danger/10"
                : chosen
                  ? "border-ink bg-ink text-ground"
                  : "border-rule-strong hover:border-ink";
            return (
              <li key={shown}>
                <button
                  type="button"
                  onClick={() => pick(shown)}
                  aria-pressed={chosen}
                  disabled={answered || saving}
                  className={`step flex min-h-14 w-full items-start gap-3 border px-4 py-3 text-left text-[17px] disabled:cursor-default ${tone}`}
                >
                  <span className="num w-5 shrink-0 font-display text-[18px] font-bold">
                    {LETTERS[shown]}
                  </span>
                  <span className="min-w-0 flex-1">{option}</span>
                  {isKey ? (
                    <Check
                      size={22}
                      strokeWidth={2.25}
                      className="shrink-0 text-ok"
                      aria-label="Right answer"
                    />
                  ) : null}
                  {wrongPick ? (
                    <X
                      size={22}
                      strokeWidth={2.25}
                      className="shrink-0 text-danger"
                      aria-label="Your answer, wrong"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="grid max-w-2xl gap-3" aria-live="polite">
          {mine ? (
            <>
              <p
                className={`caps text-[18px] ${
                  mine.is_correct === true
                    ? "text-ok"
                    : mine.is_correct === false
                      ? "text-danger"
                      : "text-ink-2"
                }`}
              >
                {mine.is_correct === true
                  ? "Right"
                  : mine.is_correct === false
                    ? "Wrong"
                    : "Saved"}
              </p>
              {mine.is_correct === false && mine.correct_index !== null ? (
                <p className="text-[16px]">
                  <span className="text-ink-2">Right answer: </span>
                  {item.options[mine.correct_index]}
                </p>
              ) : null}
              {mine.explanation ? (
                <p className="text-[16px] text-ink-2">{mine.explanation}</p>
              ) : null}
            </>
          ) : isSkipped ? (
            <p className="caps text-[18px] text-ink-2">Skipped</p>
          ) : (
            <p className="flex min-h-12 items-center text-[15px] text-ink-2">
              Pick an answer.
            </p>
          )}
          {error ? (
            <p role="alert" className="text-[15px] text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          {answered ? (
            <Button onClick={next}>
              {index + 1 < total ? "Next" : "See results"}
            </Button>
          ) : error ? (
            <Button variant="line" onClick={skip}>
              Skip this one
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
