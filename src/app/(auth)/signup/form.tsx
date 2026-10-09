"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Field, FormMessage } from "@/components/form";
import { signup, type AuthState } from "../actions";

export function SignupForm({ admin: startAdmin = false }: { admin?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signup, {});
  const [admin, setAdmin] = useState(startAdmin);
  const toggled = useRef(false);
  // Only after a tap, not on first load: send focus to the field that just appeared.
  useEffect(() => {
    if (admin && toggled.current) document.getElementById("f-passcode")?.focus();
  }, [admin]);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <h1 className="font-display text-[44px] leading-none font-bold uppercase">{admin ? "Admin sign-up" : "Join the chapter"}</h1>
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
      {admin ? <input type="hidden" name="admin" value="1" /> : null}
      {admin ? (
        <Field
          label="Admin passcode"
          name="passcode"
          type="password"
          autoComplete="off"
          required
          error={state.fieldErrors?.passcode}
          hint="From a chapter executive."
        />
      ) : null}
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Making account" : "Make account"}
      </Button>
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 text-[16px]">
        <p>
          Already in?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
        <button
          type="button"
          aria-expanded={admin}
          aria-controls={admin ? "f-passcode" : undefined}
          onClick={() => {
            toggled.current = true;
            setAdmin((a) => !a);
          }}
          className="text-ink-2 underline"
        >
          {admin ? "Not an admin" : "Admin?"}
        </button>
      </div>
    </form>
  );
}
