"use client";

import { useActionState, type ReactNode } from "react";
import { AvatarForm } from "@/components/avatar-form";
import { Button, Field, FormMessage, Select } from "@/components/form";
import { SettingsSection } from "@/components/settings-section";
import type { AuthState } from "@/app/(auth)/actions";
import { GRADES } from "@/lib/profile";
import { changePassword, updateGrade, updateName } from "./actions";

type Action = (state: AuthState, form: FormData) => Promise<AuthState>;

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
    <SettingsSection
      id="name-h"
      title="Name"
      description="How your name appears in the app."
    >
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
    </SettingsSection>
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
    <SettingsSection
      id="picture-h"
      title="Picture"
      description="The picture shown next to your name."
    >
      <AvatarForm
        userId={userId}
        name={name}
        src={src}
        hasPicture={hasPicture}
        animated={animated}
        gifLimit={gifLimit}
      />
    </SettingsSection>
  );
}

export function GradeSection({ grade }: { grade: number | null }) {
  return (
    <SettingsSection
      id="grade-h"
      title="Grade"
      description="Shown on your profile."
    >
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
    </SettingsSection>
  );
}

export function PasswordSection() {
  return (
    <SettingsSection
      id="password-h"
      title="Password"
      description="Change the password you sign in with."
    >
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
    </SettingsSection>
  );
}
