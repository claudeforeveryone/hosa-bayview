"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/form";
import { requestReset, type AuthState } from "../actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestReset, {});
  return (
    <form action={action} className="grid gap-5" noValidate>
      <h1 className="font-display text-[44px] leading-none font-bold uppercase">Reset password</h1>
      <p className="text-ink-2">We&rsquo;ll email you a link to set a new one.</p>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Sending" : "Send reset link"}
      </Button>
      <Link href="/login" className="text-[16px] underline">
        Back to log in
      </Link>
    </form>
  );
}
