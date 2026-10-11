"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { askTeacher, reportQuestion } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";
import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  checkReport,
  reasonLabel,
  type FlagReason,
  type ReportReason,
} from "@/lib/flag-reasons";

export type FlagState = {
  id: string;
  note: string;
  status: "open" | "answered";
  reply: string;
  reason: FlagReason;
};

type Mode = "idle" | "ask" | "report";

const ACTION =
  "caps step inline-flex h-10 items-center border px-4 text-[15px]";

// Ask teacher, or Report this question, on one answered question. Both are the same thread (one per member per
// question): a report is an ask with what is wrong (wrong key, unclear, typo, something else). The trainer's reply
// shows here once it's in.
// While a report is open there is no Ask button: Change report holds the note, so adding words never quietly turns
// the report back into a plain question (the database keeps the report either way, 0231).
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
  // A report on the thread proves reports are on, whatever the probe said.
  const showReport = canReport || reported !== null;

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

  const open = (next: Mode) => {
    setError(null);
    setNote(current?.note ?? "");
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
      setCurrent({
        id: r.id,
        note: note.trim(),
        status: "open",
        reply: "",
        // An ask on an open report keeps the report (0231).
        reason: from === "report" && reason ? reason : (reported ?? "ask"),
      });
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
            Your trainer gets it with your name, like Ask teacher.
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
            </>
          )}
        </div>
      ) : null}
      {/* Once the trainer has replied, the thread is closed: asking or reporting again would drop their reply. */}
      {current?.status !== "answered" ? (
        <div className="flex flex-wrap gap-2">
          {reported ? null : (
            <button
              ref={askButton}
              type="button"
              onClick={() => open("ask")}
              className={`${ACTION} border-ink hover:bg-band`}
            >
              {current ? "Ask again" : "Ask teacher"}
            </button>
          )}
          {showReport ? (
            <button
              ref={reportButton}
              type="button"
              onClick={() => open("report")}
              className={`${ACTION} border-rule-strong text-ink-2 hover:border-ink hover:text-ink`}
            >
              {reported ? "Change report" : "Report this question"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
