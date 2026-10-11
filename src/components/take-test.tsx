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
import { answerKeysLabel, keysLine } from "@/lib/answer-keys";
import {
  createAnswerSaves,
  type AnswerSaves,
  type Settled,
} from "@/lib/answer-saves";
import {
  settleAnswer,
  showAnswer,
  submitBlock,
  type Answer,
} from "@/lib/attempt-answers";
import { feedback, primeFeedback } from "@/lib/feedback";
import { rollLuckyBonus } from "@/lib/lucky-client";
import type { AttemptQuestion } from "@/lib/tests";
import { KeyHint, KeyLine } from "@/components/key-hint";
import { useAnswerKeys } from "@/hooks/use-answer-keys";

const LETTERS = "ABCDE";
// How long a submit waits for picks still on their way: a tap waits a while, the timer (or a tap after time
// is up) only briefly, so a request that hangs can't hold an attempt open past its deadline.
const TAP_WAIT = 10_000;
const CLOSE_WAIT = 4_000;

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

  // What the server had stored when the page loaded (an attempt picks up where it left off).
  const [stored] = useState<Record<string, Answer>>(() => {
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
  const [answers, setAnswers] = useState<Record<string, Answer>>(stored);
  const [current, setCurrent] = useState(() => {
    const firstOpen = rows.findIndex((q) => !(q.question_id in stored));
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, startSubmit] = useTransition();
  // The practice question whose verdict just came back, so only a fresh verdict animates (not one you go back to).
  const [fresh, setFresh] = useState<string | null>(null);
  const submitted = useRef(false);
  const autoTried = useRef(false);
  // The questions the last "didn't save" warning named: tapping again for the same ones submits anyway.
  const warned = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // The question on screen, read when a verdict comes back after a server round trip.
  const onScreen = useRef(current);
  // The last answer the server confirmed per question: where a failed save goes back to.
  const confirmed = useRef(stored);
  // Picks save in the background, one at a time per question (lib/answer-saves). Made on first use, in a handler.
  const saves = useRef<AnswerSaves | null>(null);

  const answered = Object.keys(answers).length;
  const left = rows.length - answered;
  const q = rows[current];
  const mine = answers[q.question_id];
  const locked = practice && mine !== undefined;

  // A save's reply (rules in lib/attempt-answers): only the newest pick for a question changes the screen, and a
  // failed one goes back to what the server last confirmed.
  const settle = (s: Settled) => {
    const out = settleAnswer(confirmed.current, s, {
      practice,
      onScreen: rows[onScreen.current]?.question_id,
    });
    confirmed.current = out.confirmed;
    const { show } = out;
    if (show !== undefined) setAnswers((a) => showAnswer(a, s.qid, show));
    if (out.error) setError(out.error);
    if (out.verdict !== undefined) {
      setFresh(s.qid);
      feedback(out.verdict ? "correct" : "wrong");
    }
  };
  const savesNow = () =>
    (saves.current ??= createAnswerSaves(
      (qid, selected) => answerQuestion(attemptId, qid, selected),
      (s) => settle(s),
    ));

  // The server's clock, so the countdown and "time is up" don't depend on the device's clock.
  const [offset] = useState(() => serverNow - Date.now());

  // byTap is false when the timer submits: no tap, so no tone (the browser would refuse it anyway).
  // Returns false when a submit is already running, so the timer knows its own try didn't start.
  const submit = useCallback(
    (byTap = true) => {
      if (submitted.current) return false;
      submitted.current = true;
      setError(null);
      if (byTap) primeFeedback();
      startSubmit(async () => {
        const timeUp = () =>
          deadline !== null && Date.now() + offset >= Date.parse(deadline);
        // A pick still on its way counts, so wait for it (briefly once time is up). If one never reached the
        // server, a tapped submit stops once so the taker can pick it again (lib/attempt-answers).
        const unsaved =
          (await saves.current?.idle(
            byTap && !timeUp() ? TAP_WAIT : CLOSE_WAIT,
          )) ?? [];
        const block = submitBlock({
          unsaved,
          byTap,
          deadlinePassed: timeUp(),
          warned: warned.current,
          rows,
          practice,
        });
        if (block) {
          warned.current = block.key;
          submitted.current = false;
          setError(block.message);
          return;
        }
        const r = await submitAttempt(attemptId).catch(() => ({
          error: `That didn't go through. Check your connection and tap ${practice ? "Finish" : "Submit"} again.`,
        }));
        if (r.error) {
          submitted.current = false;
          setError(r.error);
        } else {
          feedback("submit", { sound: byTap });
          void rollLuckyBonus("test");
          router.refresh();
        }
      });
      return true;
    },
    [attemptId, deadline, offset, practice, router, rows],
  );

  // Countdown against the server's clock; submits itself at zero.
  const [remaining, setRemaining] = useState(() =>
    deadline ? Date.parse(deadline) - serverNow : 0,
  );
  useEffect(() => {
    if (!deadline) return;
    const end = Date.parse(deadline);
    const tick = () => {
      const ms = end - (Date.now() + offset);
      setRemaining(ms);
      // Auto-submit once; if that fails the Submit button stays for a manual retry. A tapped submit already
      // running counts as the try only once it ends, so the timer tries again if that one stopped short.
      if (ms <= 0 && !autoTried.current) autoTried.current = submit(false);
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

  // Each tap shows at once and saves in the background. A change made while an earlier save is on its way is
  // sent after it rather than dropped, and a save that fails puts back the last answer the server stored.
  const pick = (original: number) => {
    if (locked || submitting) return;
    const qid = q.question_id;
    setError(null);
    warned.current = null;
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
    void savesNow().save(qid, original);
  };

  // 1-4 (or A-D) pick the choice on screen, as a click would; Left and Right move; Enter goes on once answered.
  useAnswerKeys({
    enabled: !confirming,
    options: locked ? 0 : q.choice_order.length,
    onPick: (shown) => pick(q.choice_order[shown]),
    onPrev: current > 0 ? () => go(current - 1) : undefined,
    onNext: current < rows.length - 1 ? () => go(current + 1) : undefined,
    onEnter:
      mine !== undefined && current < rows.length - 1
        ? () => go(current + 1)
        : undefined,
  });

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
        {/* How far through the paper you are, filling left to right as each question is answered. */}
        <span
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={rows.length}
          aria-valuenow={answered}
          className="absolute inset-x-0 bottom-0 block h-[3px] overflow-hidden bg-rule"
        >
          <span
            className="progress-fill block h-full bg-you-line"
            style={{ transform: `scaleX(${answered / rows.length})` }}
          />
        </span>
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
        <KeyLine
          className="-mt-3"
          text={keysLine(answerKeysLabel(q.choice_order.length), "← → move")}
        />
        <SelectionCards
          key={`cards-${q.question_id}`}
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
                  aria-keyshortcuts={`${shown + 1} ${LETTERS[shown]}`}
                  disabled={locked || submitting}
                  className={`press step flex min-h-14 w-full items-start gap-3 border px-4 py-3 text-left text-[17px] disabled:cursor-default ${tone}`}
                >
                  <span className="num w-5 shrink-0 font-display text-[18px] font-bold">
                    {LETTERS[shown]}
                  </span>
                  <span className="min-w-0 flex-1">{q.options[original]}</span>
                  <KeyHint n={shown + 1} />
                  {right ? (
                    <Check
                      size={22}
                      strokeWidth={2.25}
                      className={`shrink-0 text-ok ${fresh === q.question_id ? "verdict-pop" : ""}`}
                      aria-label="Right answer"
                    />
                  ) : null}
                  {wrong ? (
                    <X
                      size={22}
                      strokeWidth={2.25}
                      className={`shrink-0 text-danger ${fresh === q.question_id ? "verdict-pop" : ""}`}
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
            key={`ask-${q.question_id}`}
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
