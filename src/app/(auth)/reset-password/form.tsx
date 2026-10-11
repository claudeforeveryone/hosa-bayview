"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/form";
import { updatePassword, type AuthState } from "../actions";

export function ResetForm({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <form action={action} className="grid gap-5" noValidate>
      <h1 className="font-display text-44 leading-none font-bold uppercase">New password</h1>
      {email ? <p className="text-16 text-ink-2">For {email}</p> : null}
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        error={state.fieldErrors?.password}
        hint="At least 8 characters."
      />
      <Field
        label="Type it again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Saving" : "Save password"}
      </Button>
    </form>
  );
}
