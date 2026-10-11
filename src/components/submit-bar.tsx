"use client";

import { useEffect, useRef } from "react";
import { Button, FormMessage } from "@/components/form";
import { submitProblemText, type SubmitProblem } from "@/lib/attempt-answers";

// The foot of a test: Finish (practice) or Submit (timed), the "still blank" step, and why a submit stopped.
// The problem shows here, beside the button just tapped: on a long test the question grid sits between this and
// the question, so up there it would be off screen and the next tap would hand in the attempt unwarned.
export function SubmitBar({
  practice,
  confirming,
  left,
  submitting,
  problem,
  onFinish,
  onSubmitNow,
  onKeepGoing,
}: {
  practice: boolean;
  // The "N questions still blank. Submit anyway?" step is open.
  confirming: boolean;
  left: number;
  submitting: boolean;
  problem: SubmitProblem | null;
  onFinish: () => void;
  onSubmitNow: () => void;
  onKeepGoing: () => void;
}) {
  const button = confirming ? "Submit now" : practice ? "Finish" : "Submit";
  const message = useRef<HTMLDivElement>(null);

  // Keep the reason in view: below the button it can land under the phone's bottom bar (scroll-margin clears it).
  useEffect(() => {
    if (!problem) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    message.current?.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [problem]);

  return (
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
              onClick={onSubmitNow}
              disabled={submitting}
            >
              {submitting ? "Submitting" : button}
            </Button>
            <Button
              type="button"
              variant="line"
              onClick={onKeepGoing}
              disabled={submitting}
              autoFocus
            >
              Keep going
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" onClick={onFinish} disabled={submitting}>
          {submitting ? "Submitting" : button}
        </Button>
      )}
      {problem ? (
        <div
          ref={message}
          className="max-w-2xl scroll-mt-24 scroll-mb-[calc(5rem+env(safe-area-inset-bottom))] lg:scroll-mb-6"
        >
          <FormMessage tone="error">
            {submitProblemText(problem, button)}
          </FormMessage>
        </div>
      ) : null}
    </div>
  );
}
