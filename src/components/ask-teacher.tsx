"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { askTeacher, reportQuestion } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";
import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  checkReport,
  reasonLabel,
  type ReportReason,
} from "@/lib/flag-reasons";
import { afterSend, threadButtons, type FlagState } from "@/lib/flag-thread";

export type { FlagState };

type Mode = "idle" | "ask" | "report";

const ACTION =
  "caps step inline-flex h-10 items-center border px-4 text-[15px]";

// Ask teacher, or Report this question, on one answered question. Both are the same thread (one per member per
// question): a report is an ask with what is wrong (wrong key, unclear, typo, something else). The trainer's reply
// shows here once it's in. Which buttons show, and what the thread looks like after a send, follow 0231's rules
// through threadButtons and afterSend (src/lib/flag-thread.ts, tested there).
// `canReport`: reports are on the database (0231). Before that only Ask teacher shows.
// Focus moves into the form when it opens and back to the button that opened it when it closes, so a keyboard or
// screen-reader user keeps their place in a long review.
export function AskTeacher({
  testId,
  questionId,
  flag,
  canReport = false,
}: {
  testId: string;
  questionId: string;
  flag: FlagState | null;
  canReport?: boolean;
}) {
  const [current, setCurrent] = useState<FlagState | null>(flag);
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState(flag?.note ?? "");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Where focus goes after the next render: into the opened form, or back to a trigger after it closes.
  const focusNext = useRef<"form" | Mode | null>(null);
  const uid = useId();
  const errorId = `${uid}-error`;
  const askButton = useRef<HTMLButtonElement>(null);
  const reportButton = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const reported = current && current.reason !== "ask" ? current.reason : null;
  const buttons = threadButtons(current, canReport);

  useEffect(() => {
    const to = focusNext.current;
    if (!to) return;
    focusNext.current = null;
    if (to === "form") firstField.current?.focus();
    else
      (to === "report"
        ? (reportButton.current ?? askButton.current)
        : (askButton.current ?? reportButton.current)
      )?.focus();
  });

  const answered = current?.status === "answered";

  const open = (next: Mode) => {
    setError(null);
    // An answered thread starts a fresh note: the old one went with the question the trainer already answered.
    setNote(answered ? "" : (current?.note ?? ""));
    setReason(reported);
    focusNext.current = "form";
    setMode(next);
  };

  const close = (from: Mode) => {
    focusNext.current = from;
    setMode("idle");
  };

  const send = () => {
    setError(null);
    if (mode === "report") {
      const problem = checkReport(reason ?? "", note);
      if (problem) return setError(problem);
    }
    const from = mode;
    start(async () => {
      const r =
        from === "report" && reason
          ? await reportQuestion(testId, questionId, reason, note)
          : await askTeacher(testId, questionId, note);
      if (r.error || !r.id) {
        setError(r.error ?? "That didn't send. Try again.");
        return;
      }
      setCurrent(
        afterSend(current, {
          id: r.id,
          mode: from === "report" ? "report" : "ask",
          reason,
          note,
        }),
      );
      close(from);
    });
  };

  if (mode !== "idle") {
    return (
      <form
        className="grid max-w-2xl gap-3 border-t border-rule-strong pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        noValidate
      >
        {mode === "report" ? (
          <fieldset
            className="grid gap-2"
            aria-describedby={error ? errorId : undefined}
          >
            <legend className="mb-2 text-[15px] font-medium">
              What&rsquo;s wrong with this question?
            </legend>
            <div className="flex flex-wrap gap-2">
              {REPORT_REASONS.map((r, i) => (
                <label
                  key={r}
                  className={`${ACTION} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                    reason === r
                      ? "border-ink bg-ink text-ground"
                      : "border-rule-strong hover:bg-band"
                  }`}
                >
                  <input
                    // The checked reason, or the first, takes focus when the form opens.
                    ref={
                      (reason ? reason === r : i === 0) ? firstField : undefined
                    }
                    type="radio"
                    name={`${uid}-reason`}
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="sr-only"
                  />
                  {reasonLabel(r)}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label htmlFor={`${uid}-note`} className="text-[15px] font-medium">
          {mode === "report" ? (
            <>
              Note <span className="font-normal text-ink-2">(optional)</span>
            </>
          ) : (
            "Ask your teacher"
          )}
        </label>
        <input
          id={`${uid}-note`}
          ref={mode === "ask" ? firstField : undefined}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={REPORT_NOTE_MAX}
          aria-describedby={error ? errorId : undefined}
          placeholder={
            mode === "ask"
              ? "Optional: what's unclear?"
              : reason === "wrong_answer"
                ? "Which answer should be right?"
                : "What should it say?"
          }
          className="step h-12 w-full border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
        />
        {mode === "report" ? (
          <p className="text-[14px] text-ink-2">
            {answered
              ? "Your trainer gets it with your name, and their reply stays here."
              : "Your trainer gets it with your name, like Ask teacher."}
          </p>
        ) : null}
        {error ? (
          <div id={errorId}>
            <FormMessage tone="error">{error}</FormMessage>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Sending" : mode === "report" ? "Send report" : "Send"}
          </Button>
          <Button
            type="button"
            variant="line"
            onClick={() => close(mode)}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid max-w-2xl gap-2 border-t border-rule-strong pt-4">
      {current ? (
        <div className="grid gap-1">
          {current.status === "answered" ? (
            <>
              <p className="caps text-[14px] text-ink-2">
                {reported
                  ? `Reported: ${reasonLabel(reported)}. Teacher replied`
                  : "Teacher replied"}
              </p>
              <p className="whitespace-pre-line text-[17px]">
                {current.reply || "Marked answered."}
              </p>
            </>
          ) : (
            <>
              <p className="caps text-[14px] text-ink-2">
                {reported
                  ? `Reported: ${reasonLabel(reported)}. Waiting for a reply.`
                  : "Asked. Waiting for a reply."}
              </p>
              {current.note ? (
                <p className="whitespace-pre-line text-ink-2">{current.note}</p>
              ) : null}
              {current.reply ? (
                <div className="mt-2 grid gap-1">
                  <p className="caps text-[13px] text-ink-2">Earlier reply</p>
                  <p className="whitespace-pre-line text-[16px]">
                    {current.reply}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {buttons.ask || buttons.report ? (
        <div className="flex flex-wrap gap-2">
          {buttons.ask ? (
            <button
              ref={askButton}
              type="button"
              onClick={() => open("ask")}
              className={`${ACTION} border-ink hover:bg-band`}
            >
              {buttons.ask}
            </button>
          ) : null}
          {buttons.report ? (
            <button
              ref={reportButton}
              type="button"
              onClick={() => open("report")}
              className={`${ACTION} border-rule-strong text-ink-2 hover:border-ink hover:text-ink`}
            >
              {buttons.report}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
