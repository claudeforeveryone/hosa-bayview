"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormMessage, Select } from "@/components/form";
import { GRADES } from "@/lib/profile";
import { signup, type AuthState } from "../actions";

export function SignupForm({ chapterGate }: { chapterGate: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signup,
    {},
  );
  const askCode = chapterGate || state.chapterGate === true;
  return (
    <form action={action} className="grid gap-5" noValidate>
      <h1 className="font-display text-[44px] leading-none font-bold uppercase">
        Join the chapter
      </h1>
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      {askCode ? (
        <Field
          label="Chapter code"
          name="chapter_code"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          error={state.fieldErrors?.chapter_code}
          hint="From a chapter executive."
        />
      ) : null}
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
      <Select
        label="Grade"
        name="grade"
        defaultValue={state.values?.grade ?? ""}
        error={state.fieldErrors?.grade}
        hint="Optional. Shown on your profile and in the members list."
      >
        <option value="">No grade</option>
        {GRADES.map((g) => (
          <option key={g} value={g}>
            Grade {g}
          </option>
        ))}
      </Select>
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
      <p className="text-[15px] text-ink-2">Everyone joins as a member. The chapter leads give out executive access.</p>
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
