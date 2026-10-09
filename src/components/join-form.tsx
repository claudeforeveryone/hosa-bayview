"use client";

import { useActionState } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { joinClassroom, type FormState } from "@/app/(app)/c/actions";

// One big field and a button. Sits on the navy field, so it uses the on-field colours.
export function JoinForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(joinClassroom, {});
  const error = state.fieldErrors?.code;
  return (
    <form action={action} className="grid max-w-xl grid-cols-1 gap-3" noValidate>
      <label htmlFor="join-code" className="text-[16px] text-on-field-2">
        Join code
      </label>
      <div className="flex">
        <input
          id="join-code"
          name="code"
          defaultValue={state.values?.code}
          required
          maxLength={9}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="6-character code"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || state.error ? "join-code-err" : undefined}
          className="num step h-16 w-0 min-w-0 flex-1 border border-on-field-2 bg-transparent px-4 font-display text-[32px] font-semibold tracking-[0.12em] text-on-field uppercase outline-none placeholder:font-sans placeholder:text-[18px] placeholder:font-normal placeholder:tracking-normal placeholder:text-on-field-2 placeholder:normal-case focus:border-on-field aria-invalid:border-on-field-danger"
        />
        <button
          type="submit"
          disabled={pending}
          className="caps step flex h-16 items-center gap-2 bg-on-field px-5 text-[19px] text-field hover:bg-on-field-2 disabled:opacity-60"
        >
          {pending ? "Joining" : "Join"}
          <ArrowRight size={22} strokeWidth={2} aria-hidden />
        </button>
      </div>
      {error || state.error ? (
        <p id="join-code-err" role="alert" className="flex gap-2 text-[16px] text-on-field-danger">
          <CircleAlert size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error ?? state.error}</span>
        </p>
      ) : null}
    </form>
  );
}
