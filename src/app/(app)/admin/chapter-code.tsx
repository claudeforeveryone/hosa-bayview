"use client";

import { useActionState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button, Field, FormMessage } from "@/components/form";
import { CHAPTER_CODE_MAX, CHAPTER_CODE_MIN } from "@/lib/chapter-code";
import {
  clearChapterCode,
  setChapterCode,
  type ChapterCodeState,
} from "./actions";

// Whether sign-up needs a chapter code, and the controls to set, change or clear it. The code itself is never
// shown: only a hash is stored.
export function ChapterCodeSection({ on }: { on: boolean }) {
  const [state, action, pending] = useActionState<ChapterCodeState, FormData>(
    setChapterCode,
    {},
  );
  return (
    <section aria-labelledby="chapter-code-h" className="grid gap-4">
      <h2
        id="chapter-code-h"
        className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
      >
        Chapter code
      </h2>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-rule py-3">
        <span
          className={`caps text-16 font-semibold ${on ? "text-ink" : "text-ink-2"}`}
        >
          {on ? "On" : "Off"}
        </span>
        <span className="text-16 text-ink-2">
          {on
            ? "New members need the code to sign up."
            : "Anyone with the link can sign up."}
        </span>
      </p>
      <form
        action={action}
        className="grid max-w-[32rem] gap-5"
        noValidate
      >
        {state.error ? (
          <FormMessage tone="error">{state.error}</FormMessage>
        ) : null}
        <Field
          label={on ? "New code" : "Code"}
          name="chapter_code"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={CHAPTER_CODE_MIN}
          maxLength={CHAPTER_CODE_MAX}
          error={state.codeError}
          hint={`At least ${CHAPTER_CODE_MIN} characters.`}
        />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving" : on ? "Change code" : "Set code"}
          </Button>
          {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
        </div>
      </form>
      {on ? (
        <ConfirmAction
          action={clearChapterCode}
          label="Clear code"
          confirmLabel="Clear"
          pendingLabel="Clearing"
          question="Clear it? Anyone with the link can sign up again."
        />
      ) : null}
    </section>
  );
}
