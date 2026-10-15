"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/(auth)/actions";
import { updateFlair } from "@/app/(app)/settings/actions";
import { Button, Field, FormMessage } from "@/components/form";
import { FLAIR_MAX } from "@/lib/flair";

// The flair field (0294). Your own in Settings; with userId, an executive editing someone else's from /admin.
export function FlairForm({
  flair,
  userId,
}: {
  flair: string | null;
  userId?: string;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    updateFlair,
    {},
  );
  const fieldId = userId ? `flair-${userId}` : "f-flair";
  return (
    <form action={action} className="grid gap-5" noValidate>
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Field
        id={fieldId}
        label="Flair"
        name="flair"
        maxLength={FLAIR_MAX}
        autoComplete="off"
        placeholder="e.g. Medical Terminology"
        defaultValue={state.values?.flair ?? flair ?? ""}
        error={state.fieldErrors?.flair}
        hint={`Up to ${FLAIR_MAX} characters: letters, numbers and simple punctuation. Leave it blank for none.`}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save flair"}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
