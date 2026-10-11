"use client";

import { useActionState, useId } from "react";
import { Plus } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { FormMessage } from "@/components/form";

export type ClassroomOption = { id: string; name: string };

// One-tap create: a real form and submit button. The server action redirects into the new item.
// Picks a classroom only when there is a choice: one classroom is sent as a hidden field.
export function NewBlank({
  action,
  label,
  variant,
  classrooms,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  label: string;
  variant: "button" | "tile";
  classrooms?: ClassroomOption[];
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, {});
  const uid = useId();
  const tile = variant === "tile";
  const [only] = classrooms ?? [];
  const many = (classrooms?.length ?? 0) > 1;

  return (
    <form action={run} className="grid gap-4">
      <div className={tile ? "grid gap-3" : "flex flex-wrap items-end gap-3"}>
        {many ? (
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={`${uid}-room`} className="text-15 font-medium">
              Event
            </label>
            <select
              id={`${uid}-room`}
              name="classroom_id"
              required
              className="step h-11 max-w-full min-w-0 border border-rule-strong bg-ground px-3 text-16 outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
            >
              {classrooms?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : only ? (
          <input type="hidden" name="classroom_id" value={only.id} />
        ) : null}

        {tile ? (
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className="step grid min-h-44 w-full place-content-center justify-items-center gap-3 border border-rule-strong px-4 py-10 text-center hover:border-ink hover:bg-band disabled:opacity-60"
          >
            <Plus size={40} strokeWidth={1.75} aria-hidden />
            <span className="font-display text-[clamp(2.25rem,9vw,3.5rem)] leading-none font-bold uppercase [overflow-wrap:anywhere]">
              {pending ? "Making it" : label}
            </span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className="caps step inline-flex h-11 shrink-0 items-center gap-2 border border-ink px-4 text-16 hover:bg-band disabled:opacity-60"
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            {pending ? "Making it" : label}
          </button>
        )}
      </div>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
    </form>
  );
}
