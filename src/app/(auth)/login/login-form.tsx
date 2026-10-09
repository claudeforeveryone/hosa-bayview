"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/form";
import { login, type AuthState } from "../actions";

export function LoginForm({ next, notice }: { next: string; notice: string | null }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});
  return (
    <form action={action} className="grid gap-5" noValidate>
      <h1 className="font-display text-[44px] leading-none font-bold uppercase">Log in</h1>
      {notice && !state.error ? <FormMessage tone="error">{notice}</FormMessage> : null}
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <input type="hidden" name="next" value={next} />
      <Field
        label="Email or username"
        name="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Logging in" : "Log in"}
      </Button>
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 text-[16px]">
        <Link href="/signup" className="underline">
          New here? Make an account
        </Link>
        <Link href="/forgot-password" className="text-ink-2 underline">
          Forgot password
        </Link>
      </div>
    </form>
  );
}
