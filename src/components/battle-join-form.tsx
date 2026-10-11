"use client";

import { useActionState } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { joinBattleByCode } from "@/app/(app)/battle/actions";
import type { FormState } from "@/app/(app)/c/actions";

// Join a battle by its 4-character code. Sits on the navy field beside the class join form.
export function BattleJoinForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    joinBattleByCode,
    {},
  );
  const error = state.fieldErrors?.code ?? state.error;
  return (
    <form
      action={action}
      className="grid max-w-xl grid-cols-1 gap-3"
      noValidate
    >
      <label htmlFor="battle-code" className="text-16 text-on-field-2">
        Battle code
      </label>
      <div className="flex">
        <input
          id="battle-code"
          name="code"
          defaultValue={state.values?.code}
          required
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="4-character code"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "battle-code-err" : undefined}
          className="num step h-16 w-0 min-w-0 flex-1 border border-on-field-2 bg-transparent px-4 font-display text-32 font-semibold tracking-[0.12em] text-on-field uppercase outline-none placeholder:font-sans placeholder:text-18 placeholder:font-normal placeholder:tracking-normal placeholder:text-on-field-2 placeholder:normal-case focus:border-on-field aria-invalid:border-on-field-danger"
        />
        <button
          type="submit"
          disabled={pending}
          className="caps step flex h-16 items-center gap-2 bg-on-field px-5 text-19 text-field hover:bg-on-field-2 disabled:opacity-60"
        >
          {pending ? "Joining" : "Battle"}
          <ArrowRight size={22} strokeWidth={2} aria-hidden />
        </button>
      </div>
      {error ? (
        <p
          id="battle-code-err"
          role="alert"
          className="flex gap-2 text-16 text-on-field-danger"
        >
          <CircleAlert
            size={20}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0"
            aria-hidden
          />
          <span>{error}</span>
        </p>
      ) : null}
    </form>
  );
}
