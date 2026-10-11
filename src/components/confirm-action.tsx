"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, FormMessage } from "@/components/form";

// Two-step destructive action without a modal: the first tap arms it, the second does it.
export function ConfirmAction({
  action: serverAction,
  label,
  confirmLabel,
  pendingLabel,
  question,
  variant = "line",
  compact = false,
  focusAfter,
}: {
  action: () => Promise<FormState>;
  label: string;
  confirmLabel: string;
  pendingLabel: string;
  question: string;
  variant?: "line" | "you";
  compact?: boolean;
  // Id to focus after success, for actions that remove the row this button sits in.
  focusAfter?: string;
}) {
  const [armed, setArmed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasArmed = useRef(false);

  // Backing out returns focus to the button that armed it.
  useEffect(() => {
    if (wasArmed.current && !armed) trigger.current?.focus();
    wasArmed.current = armed;
  }, [armed]);
  const [state, run, pending] = useActionState<FormState>(async () => {
    const result = await serverAction();
    if (!result.error && focusAfter) document.getElementById(focusAfter)?.focus();
    return result;
  }, {});
  const size = compact ? "h-10 px-4 text-15" : "";

  if (!armed) {
    return (
      <div className="grid justify-items-start gap-2">
        <Button
          ref={trigger}
          type="button"
          variant={variant === "you" ? "line" : variant}
          className={size}
          onClick={() => setArmed(true)}
        >
          {label}
        </Button>
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-3" role="group" aria-label={question}>
      <p className="text-16">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="you"
          className={size}
          disabled={pending}
          onClick={() => startTransition(run)}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
        <Button type="button" variant="line" className={size} disabled={pending} onClick={() => setArmed(false)} autoFocus>
          Keep it
        </Button>
      </div>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
    </div>
  );
}
