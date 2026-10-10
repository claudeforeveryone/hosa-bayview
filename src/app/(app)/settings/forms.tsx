"use client";

import { useActionState, type ReactNode } from "react";
import { AvatarForm } from "@/components/avatar-form";
import { Button, Field, FormMessage, Select } from "@/components/form";
import type { AuthState } from "@/app/(auth)/actions";
import { GRADES } from "@/lib/profile";
import {
  changePassword,
  updateGrade,
  updateName,
} from "./actions";

type Action = (state: AuthState, form: FormData) => Promise<AuthState>;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-1 gap-5 border-t-[3px] border-ink pt-5 lg:grid-cols-[16rem_minmax(0,32rem)]"
    >
      <h2
        id={id}
        className="font-display text-[clamp(1.75rem,5vw,2.25rem)] leading-none font-bold uppercase"
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function SettingsForm({
  action,
  submit,
  pendingLabel,
  children,
}: {
  action: Action;
  submit: string;
  pendingLabel: string;
  children: (state: AuthState) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    {},
  );
  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      {children(state)}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submit}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}

export function NameSection({ name }: { name: string }) {
  return (
    <Section id="name-h" title="Name">
      <SettingsForm
        action={updateName}
        submit="Save name"
        pendingLabel="Saving"
      >
        {(state) => (
          <Field
            label="Your name"
            name="full_name"
            autoComplete="name"
            required
            defaultValue={state.values?.full_name ?? name}
            error={state.fieldErrors?.full_name}
          />
        )}
      </SettingsForm>
    </Section>
  );
}

export function PictureSection({
  userId,
  name,
  src,
  hasPicture,
  animated,
  gifLimit,
}: {
  userId: string;
  name: string;
  src: string | null;
  hasPicture: boolean;
  animated: boolean;
  gifLimit: number;
}) {
  return (
    <Section id="picture-h" title="Picture">
      <AvatarForm
        userId={userId}
        name={name}
        src={src}
        hasPicture={hasPicture}
        animated={animated}
        gifLimit={gifLimit}
      />
    </Section>
  );
}

export function GradeSection({ grade }: { grade: number | null }) {
  return (
    <Section id="grade-h" title="Grade">
      <SettingsForm
        action={updateGrade}
        submit="Save grade"
        pendingLabel="Saving"
      >
        {(state) => (
          <Select
            label="Grade"
            name="grade"
            defaultValue={state.values?.grade ?? (grade ? String(grade) : "")}
            error={state.fieldErrors?.grade}
            hint="Shown on your profile."
          >
            <option value="">No grade</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </Select>
        )}
      </SettingsForm>
    </Section>
  );
}

export function PasswordSection() {
  return (
    <Section id="password-h" title="Password">
      <SettingsForm
        action={changePassword}
        submit="Change password"
        pendingLabel="Saving"
      >
        {(state) => (
          <>
            <Field
              label="Current password"
              name="current"
              type="password"
              autoComplete="current-password"
              required
              error={state.fieldErrors?.current}
            />
            <Field
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              error={state.fieldErrors?.password}
              hint="At least 8 characters. Signs out your other devices."
            />
            <Field
              label="Type it again"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              error={state.fieldErrors?.confirm}
            />
          </>
        )}
      </SettingsForm>
    </Section>
  );
}
