"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Timer, X } from "lucide-react";
import {
  answerQuestion,
  submitAttempt,
} from "@/app/(app)/c/[id]/tests/actions";
import { AskTeacher, type FlagState } from "@/components/ask-teacher";
import { Button, FormMessage } from "@/components/form";
import { SelectionCards, type DeckOption } from "@/components/selection-cards";
import { feedback, primeFeedback } from "@/lib/feedback";
import { rollLuckyBonus } from "@/lib/lucky-client";
import type { AttemptQuestion } from "@/lib/tests";

type Answer = {
  selected: number;
  // Null while the answer is saving, and when the trainer has answers off (no verdict to show).
  is_correct: boolean | null;
  correct_index: number | null;
  explanation: string | null;
  // True once the server has stored the pick (rows from the page always are).
  saved: boolean;
};

const LETTERS = "ABCDE";

function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function TakeTest({
  testId,
  attemptId,
  mode,
  deadline,
  serverNow,
  rows,
  decks,
  flags,
}: {
  testId: string;
  attemptId: string;
  mode: "timed" | "practice";
  deadline: string | null;
  serverNow: number;
  // Already in the order the server chose for this attempt.
  rows: AttemptQuestion[];
  decks: DeckOption[];
  flags: Record<string, FlagState>;
}) {
  const router = useRouter();
  const practice = mode === "practice";

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const out: Record<string, Answer> = {};
    for (const r of rows) {
      if (r.selected_index !== null) {
        out[r.question_id] = {
          selected: r.selected_index,
          is_correct: r.is_correct,
          correct_index: r.correct_index,
          explanation: r.explanation,
          saved: true,
        };
      }
    }
    return out;
  });
  const [current, setCurrent] = useState(() => {
    const firstOpen = rows.findIndex((q) => !(q.question_id in answers));
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);
  // The practice question whose verdict just came back, so only a fresh verdict animates (not one you go back to).
  const [fresh, setFresh] = useState<string | null>(null);
  const submitted = useRef(false);
  const autoTried = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // The question on screen, read when a verdict comes back after a server round trip.
  const onScreen = useRef(current);

  const answered = Object.keys(answers).length;
  const left = rows.length - answered;
  const q = rows[current];
  const mine = answers[q.question_id];
  const locked = practice && mine !== undefined;

  // byTap is false when the timer submits: no tap, so no tone (the browser would refuse it anyway).
  const submit = useCallback((byTap = true) => {
    if (submitted.current) return;
    submitted.current = true;
    setError(null);
    if (byTap) primeFeedback();
    startSubmit(async () => {
      const r = await submitAttempt(attemptId);
      if (r.error) {
        submitted.current = false;
        setError(r.error);
      } else {
        feedback("submit", { sound: byTap });
        void rollLuckyBonus("test");
        router.refresh();
      }
    });
  }, [attemptId, router]);

  // Countdown against the server's clock; submits itself at zero.
  const [offset] = useState(() => serverNow - Date.now());
  const [remaining, setRemaining] = useState(() =>
    deadline ? Date.parse(deadline) - serverNow : 0,
  );
  useEffect(() => {
    if (!deadline) return;
    const end = Date.parse(deadline);
    const tick = () => {
      const ms = end - (Date.now() + offset);
      setRemaining(ms);
      // Auto-submit once; if that fails the Submit button stays for a manual retry.
      if (ms <= 0 && !autoTried.current) {
        autoTried.current = true;
        submit(false);
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [deadline, offset, submit]);

  const go = (i: number) => {
    setCurrent(i);
    onScreen.current = i;
    setConfirming(false);
    setFresh(null);
    requestAnimationFrame(() => heading.current?.focus());
  };

  const pick = async (original: number) => {
    if (locked || submitting || saving === q.question_id) return;
    const qid = q.question_id;
    const before = answers[qid];
    setError(null);
    // Practice: the verdict sound comes after the server answers, so wake audio now, inside the tap.
    // Timed: no verdict until the end, so the tap itself gets a soft tick.
    if (practice) primeFeedback();
    else feedback("flip");
    setAnswers((a) => ({
      ...a,
      [qid]: {
        selected: original,
        is_correct: null,
        correct_index: null,
        explanation: null,
        saved: false,
      },
    }));
    setSaving(qid);
    const r = await answerQuestion(attemptId, qid, original);
    setSaving(null);
    if (r.error) {
      setAnswers((a) => {
        const next = { ...a };
        if (before) next[qid] = before;
        else delete next[qid];
        return next;
      });
      setError(r.error);
      return;
    }
    setAnswers((a) => ({
      ...a,
      [qid]: {
        // The server's stored pick wins (a stale second tab can't change a locked practice answer).
        selected: r.selected_index ?? original,
        is_correct: r.is_correct ?? null,
        correct_index: r.correct_index ?? null,
        explanation: r.explanation ?? null,
        saved: true,
      },
    }));
    // Only for the question still on screen: a verdict that lands after you moved on is just stored, and
    // shows quietly, without the reveal, when you go back.
    if (practice && typeof r.is_correct === "boolean" && rows[onScreen.current]?.question_id === qid) {
      setFresh(qid);
      feedback(r.is_correct ? "correct" : "wrong");
    }
  };

  const low = deadline !== null && remaining <= 60_000;
  const rightText =
    locked && mine?.correct_index != null
      ? (q.options[mine.correct_index] ?? null)
      : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-4 border-b border-rule bg-ground px-4 py-3 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <p className="caps num text-[16px] text-ink-2">
          {answered}/{rows.length} answered
        </p>
        {deadline ? (
          <p
            className={`num flex items-center gap-2 font-display text-[28px] leading-none font-bold ${low ? "text-danger" : ""}`}
            role="timer"
            aria-label={`Time left ${clock(remaining)}`}
          >
            <Timer size={22} strokeWidth={1.75} aria-hidden />
            {clock(remaining)}
          </p>
        ) : (
          <p className="caps text-[16px] text-ink-2">Practice</p>
        )}
      </div>

      <section aria-labelledby="q-h" className="grid gap-5">
        <h2
          id="q-h"
          ref={heading}
          tabIndex={-1}
          className="caps num scroll-mt-24 text-[16px] text-ink-2 outline-none"
        >
          Question {current + 1} of {rows.length}
        </h2>
        <SelectionCards
          key={q.question_id}
          decks={decks}
          answer={rightText}
          enabled={locked}
        >
          <p className="max-w-[65ch] text-[clamp(1.25rem,4vw,1.6rem)] leading-snug font-medium whitespace-pre-line">
            {q.prompt}
          </p>
        </SelectionCards>
        <ul className="grid max-w-2xl gap-2">
          {q.choice_order.map((original, shown) => {
            const chosen = mine?.selected === original;
            const right = locked && mine?.correct_index === original;
            const wrong = locked && chosen && mine?.is_correct === false;
            const tone = right
              ? "border-ok bg-ok/15"
              : wrong
                ? "border-danger bg-danger/10"
                : chosen
                  ? "border-ink bg-ink text-ground"
                  : "border-rule-strong hover:border-ink";
            return (
              <li key={original}>
                <button
                  type="button"
                  onClick={() => pick(original)}
                  aria-pressed={chosen}
                  disabled={locked || submitting}
                  className={`step flex min-h-14 w-full items-start gap-3 border px-4 py-3 text-left text-[17px] disabled:cursor-default ${tone}`}
                >
                  <span className="num w-5 shrink-0 font-display text-[18px] font-bold">
                    {LETTERS[shown]}
                  </span>
                  <span className="min-w-0 flex-1">{q.options[original]}</span>
                  {right ? (
                    <Check
                      size={22}
                      strokeWidth={2.25}
                      className="shrink-0 text-ok"
                      aria-label="Right answer"
                    />
                  ) : null}
                  {wrong ? (
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
        {/* Always mounted so screen readers announce the verdict when it arrives. */}
        <div className="grid max-w-2xl gap-2" aria-live="polite">
          {locked ? (
            <>
              <p
                key={mine?.saved ? "verdict" : "checking"}
                className={`caps text-[18px] ${
                  mine?.saved && fresh === q.question_id ? "reveal" : ""
                } ${
                  mine?.saved && mine.is_correct
                    ? "text-ok"
                    : mine?.saved && mine.is_correct === false
                      ? "text-danger"
                      : "text-ink-2"
                }`}
              >
                {!mine?.saved
                  ? "Checking"
                  : mine.is_correct
                    ? "Right"
                    : mine.is_correct === false
                      ? "Not quite"
                      : "Saved"}
              </p>
              {mine?.explanation ? (
                <p className="text-ink-2">{mine.explanation}</p>
              ) : null}
            </>
          ) : null}
        </div>
        {locked && mine?.saved ? (
          <AskTeacher
            key={q.question_id}
            testId={testId}
            questionId={q.question_id}
            flag={flags[q.question_id] ?? null}
          />
        ) : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="line"
          onClick={() => go(current - 1)}
          disabled={current === 0}
        >
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
          Back
        </Button>
        {current < rows.length - 1 ? (
          <Button type="button" onClick={() => go(current + 1)}>
            Next
            <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
          </Button>
        ) : null}
      </div>

      <nav aria-label="Questions" className="grid gap-2">
        <ol className="flex flex-wrap gap-1.5">
          {rows.map((x, i) => {
            const a = answers[x.question_id];
            const tone =
              practice && a?.is_correct === true
                ? "border-ok text-ok"
                : practice && a?.is_correct === false
                  ? "border-danger text-danger"
                  : a
                    ? "border-ink bg-ink text-ground"
                    : "border-rule text-ink-2";
            return (
              <li key={x.question_id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === current ? "step" : undefined}
                  aria-label={`Question ${i + 1}${a ? ", answered" : ""}`}
                  className={`num step grid size-11 place-items-center border text-[15px] font-semibold ${tone} ${
                    i === current
                      ? "outline-2 outline-offset-2 outline-ink"
                      : ""
                  }`}
                >
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid justify-items-start gap-3 border-t border-rule pt-6">
        {confirming ? (
          <div
            className="grid gap-3"
            role="group"
            aria-label="Submit with questions left"
          >
            <p>
              {left} question{left === 1 ? "" : "s"} still blank. Submit anyway?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="you"
                onClick={() => submit()}
                disabled={submitting}
              >
                {submitting ? "Submitting" : "Submit now"}
              </Button>
              <Button
                type="button"
                variant="line"
                onClick={() => setConfirming(false)}
                disabled={submitting}
                autoFocus
              >
                Keep going
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            onClick={() => (left ? setConfirming(true) : submit())}
            disabled={submitting}
          >
            {submitting ? "Submitting" : practice ? "Finish" : "Submit"}
          </Button>
        )}
      </div>
    </div>
  );
}
