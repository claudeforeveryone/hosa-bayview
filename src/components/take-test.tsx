"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Timer, X } from "lucide-react";
import { answerQuestion, submitAttempt } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";
import { permutation } from "@/lib/shuffle";

export type TakeRow = {
  question_id: string;
  prompt: string;
  options: string[];
  selected_index: number | null;
  is_correct: boolean | null;
  correct_index: number | null;
  explanation: string | null;
};

type Answer = { selected: number; is_correct: boolean | null; correct_index: number | null; explanation: string | null };

const LETTERS = "ABCDE";

function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function TakeTest({
  attemptId,
  mode,
  deadline,
  serverNow,
  rows,
}: {
  attemptId: string;
  mode: "timed" | "practice";
  deadline: string | null;
  serverNow: number;
  rows: TakeRow[];
}) {
  const router = useRouter();
  const practice = mode === "practice";

  // Same order on every reload of this attempt; different for the next attempt.
  const order = useMemo(() => permutation(rows.length, attemptId), [rows.length, attemptId]);
  const questions = useMemo(
    () =>
      order.map((i) => {
        const row = rows[i];
        return { ...row, choiceOrder: permutation(row.options.length, `${attemptId}:${row.question_id}`) };
      }),
    [order, rows, attemptId],
  );

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const out: Record<string, Answer> = {};
    for (const r of rows) {
      if (r.selected_index !== null) {
        out[r.question_id] = {
          selected: r.selected_index,
          is_correct: r.is_correct,
          correct_index: r.correct_index,
          explanation: r.explanation,
        };
      }
    }
    return out;
  });
  const [current, setCurrent] = useState(() => {
    const firstOpen = questions.findIndex((q) => !(q.question_id in answers));
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);
  const submitted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const answered = Object.keys(answers).length;
  const left = questions.length - answered;
  const q = questions[current];
  const mine = answers[q.question_id];
  const locked = practice && mine !== undefined;

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    setError(null);
    startSubmit(async () => {
      const r = await submitAttempt(attemptId);
      if (r.error) {
        submitted.current = false;
        setError(r.error);
      } else router.refresh();
    });
  }, [attemptId, router]);

  // Countdown against the server's clock; submits itself at zero.
  const [offset] = useState(() => serverNow - Date.now());
  const [remaining, setRemaining] = useState(() => (deadline ? Date.parse(deadline) - serverNow : 0));
  useEffect(() => {
    if (!deadline) return;
    const end = Date.parse(deadline);
    const tick = () => {
      const ms = end - (Date.now() + offset);
      setRemaining(ms);
      if (ms <= 0) submit();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [deadline, offset, submit]);

  const go = (i: number) => {
    setCurrent(i);
    setConfirming(false);
    requestAnimationFrame(() => heading.current?.focus());
  };

  const pick = async (original: number) => {
    if (locked || submitting || saving) return;
    const qid = q.question_id;
    const before = answers[qid];
    setError(null);
    setAnswers((a) => ({ ...a, [qid]: { selected: original, is_correct: null, correct_index: null, explanation: null } }));
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
        selected: original,
        is_correct: r.is_correct ?? null,
        correct_index: r.correct_index ?? null,
        explanation: r.explanation ?? null,
      },
    }));
  };

  const low = deadline !== null && remaining <= 60_000;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-4 border-b border-rule bg-ground px-4 py-3 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <p className="caps num text-[16px] text-ink-2">
          {answered}/{questions.length} answered
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
        <h2 id="q-h" ref={heading} tabIndex={-1} className="caps num text-[16px] text-ink-2 outline-none">
          Question {current + 1} of {questions.length}
        </h2>
        <p className="max-w-[65ch] text-[clamp(1.25rem,4vw,1.6rem)] leading-snug font-medium whitespace-pre-line">{q.prompt}</p>
        <ul className="grid max-w-2xl gap-2">
          {q.choiceOrder.map((original, shown) => {
            const chosen = mine?.selected === original;
            const right = locked && mine?.correct_index === original;
            const wrong = locked && chosen && !mine?.is_correct;
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
                  <span className="num w-5 shrink-0 font-display text-[18px] font-bold">{LETTERS[shown]}</span>
                  <span className="min-w-0 flex-1">{q.options[original]}</span>
                  {right ? <Check size={22} strokeWidth={2.25} className="shrink-0 text-ok" aria-label="Right answer" /> : null}
                  {wrong ? <X size={22} strokeWidth={2.25} className="shrink-0 text-danger" aria-label="Your answer, wrong" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        {locked ? (
          <div className="grid max-w-2xl gap-2" aria-live="polite">
            <p className={`caps text-[18px] ${mine?.is_correct ? "text-ok" : "text-danger"}`}>
              {mine?.is_correct ? "Right" : mine?.is_correct === false ? "Not quite" : "Saving"}
            </p>
            {mine?.explanation ? <p className="text-ink-2">{mine.explanation}</p> : null}
          </div>
        ) : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="line" onClick={() => go(current - 1)} disabled={current === 0}>
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
          Back
        </Button>
        {current < questions.length - 1 ? (
          <Button type="button" onClick={() => go(current + 1)}>
            Next
            <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
          </Button>
        ) : null}
      </div>

      <nav aria-label="Questions" className="grid gap-2">
        <ol className="flex flex-wrap gap-1.5">
          {questions.map((x, i) => {
            const a = answers[x.question_id];
            const tone =
              practice && a?.is_correct === true
                ? "border-ok text-ok"
                : practice && a?.is_correct === false
                  ? "border-danger text-danger"
                  : a
                    ? "border-ink bg-ink text-ground"
                    : "border-dashed border-rule-strong text-ink-2";
            return (
              <li key={x.question_id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === current ? "step" : undefined}
                  aria-label={`Question ${i + 1}${a ? ", answered" : ""}`}
                  className={`num step grid size-11 place-items-center border text-[15px] font-semibold ${tone} ${
                    i === current ? "outline-2 outline-offset-2 outline-ink" : ""
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
          <div className="grid gap-3" role="group" aria-label="Submit with questions left">
            <p>
              {left} question{left === 1 ? "" : "s"} still blank. Submit anyway?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="you" onClick={submit} disabled={submitting}>
                {submitting ? "Submitting" : "Submit now"}
              </Button>
              <Button type="button" variant="line" onClick={() => setConfirming(false)} disabled={submitting} autoFocus>
                Keep going
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" onClick={() => (left ? setConfirming(true) : submit())} disabled={submitting}>
            {submitting ? "Submitting" : practice ? "Finish" : "Submit"}
          </Button>
        )}
      </div>
    </div>
  );
}
