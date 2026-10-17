"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, Field, FormMessage, Select, TextArea } from "@/components/form";
import type { ChannelOption } from "@/lib/announcement-channels";

type Values = { title: string; body: string; pinned: boolean };

// Post or edit one announcement. Posting clears the form; editing keeps what was typed. With channels, the form
// starts with a "Post to" picker (the inbox: the chapter or one of your rooms), sent as `channel`.
export function AnnouncementForm({
  action,
  initial,
  submitLabel,
  pendingLabel,
  resetOnSave = false,
  channels,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: Values;
  submitLabel: string;
  pendingLabel: string;
  resetOnSave?: boolean;
  channels?: ChannelOption[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const v = state.values
    ? {
        title: state.values.title ?? "",
        body: state.values.body ?? "",
        pinned: state.values.pinned === "on",
      }
    : initial;

  useEffect(() => {
    if (resetOnSave && state.ok) formRef.current?.reset();
  }, [state, resetOnSave]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid max-w-2xl gap-5"
      noValidate
    >
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      {channels?.length ? (
        <Select
          id={`${uid}-channel`}
          label="Post to"
          name="channel"
          // Keyed on the value so a failed post comes back on the channel it was aimed at.
          key={state.values?.channel ?? channels[0].value}
          defaultValue={state.values?.channel ?? channels[0].value}
          hint="Only the people in that channel are notified."
        >
          {channels.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      ) : null}
      <Field
        id={`${uid}-title`}
        label="Headline"
        name="title"
        maxLength={120}
        defaultValue={v?.title}
        error={state.fieldErrors?.title}
      />
      <TextArea
        id={`${uid}-body`}
        label="Details"
        name="body"
        maxLength={5000}
        rows={5}
        defaultValue={v?.body}
        error={state.fieldErrors?.body}
        hint="Optional. Line breaks stay."
      />
      <label
        htmlFor={`${uid}-pin`}
        className="flex min-h-11 items-center gap-3 text-17"
      >
        <input
          id={`${uid}-pin`}
          name="pinned"
          type="checkbox"
          defaultChecked={v?.pinned}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        Pin to the top
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
