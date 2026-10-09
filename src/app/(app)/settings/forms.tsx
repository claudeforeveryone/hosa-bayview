"use client";

import { useActionState, type ReactNode } from "react";
import { AvatarForm } from "@/components/avatar-form";
import { Button, Field, FormMessage, Select } from "@/components/form";
import { claimAdmin, type AuthState } from "@/app/(auth)/actions";
import { GRADES } from "@/lib/profile";
import {
  changePassword,
  setAdminPasscode,
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
      className="grid grid-cols-1 gap-5 border-t border-rule pt-6 lg:grid-cols-[16rem_minmax(0,32rem)]"
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

const NOTICE = {
  wrong:
    "Your account is made, but that passcode wasn't right. Try it again here.",
  slow: "Your account is made, but there were too many wrong passcodes. Try again here in 10 minutes.",
  retry:
    "Your account is made, but the passcode check didn't go through. Try it again here.",
} as const;
export type PasscodeNotice = keyof typeof NOTICE;

export function ClaimAdminSection({
  notice,
}: {
  notice: PasscodeNotice | null;
}) {
  return (
    <Section id="admin-h" title="Admin">
      {notice ? (
        <div className="mb-5">
          <FormMessage tone="error">{NOTICE[notice]}</FormMessage>
        </div>
      ) : null}
      <SettingsForm
        action={claimAdmin}
        submit="Become an admin"
        pendingLabel="Checking"
      >
        {(state) => (
          <Field
            label="Admin passcode"
            name="passcode"
            type="password"
            autoComplete="off"
            required
            error={state.fieldErrors?.passcode}
            hint="From a chapter executive."
          />
        )}
      </SettingsForm>
    </Section>
  );
}

export function PasscodeSection({ isSet }: { isSet: boolean }) {
  return (
    <Section id="passcode-h" title="Admin passcode">
      <SettingsForm
        action={setAdminPasscode}
        submit={isSet ? "Change passcode" : "Set passcode"}
        pendingLabel="Saving"
      >
        {(state) => (
          <Field
            label={isSet ? "New passcode" : "Passcode"}
            name="new_passcode"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            error={state.fieldErrors?.new_passcode}
            hint={
              isSet
                ? "Anyone who enters it at Admin sign-up becomes an executive. Changing it stops the old one working."
                : "Not set, so no one can sign up as an admin. Anyone who enters it becomes an executive."
            }
          />
        )}
      </SettingsForm>
    </Section>
  );
}
