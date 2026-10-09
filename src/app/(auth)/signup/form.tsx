"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/form";
import { signup, type AuthState } from "../actions";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signup, {});
  return (
    <form action={action} className="grid gap-5" noValidate>
      <h1 className="font-display text-[44px] leading-none font-bold uppercase">Join the chapter</h1>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      <Field
        label="Your name"
        name="full_name"
        autoComplete="name"
        required
        defaultValue={state.values?.full_name}
        error={state.fieldErrors?.full_name}
      />
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
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        error={state.fieldErrors?.password}
        hint="At least 8 characters."
      />
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Making account" : "Make account"}
      </Button>
      <p className="text-[16px]">
        Already in?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
