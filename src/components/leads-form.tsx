"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, FormMessage, Select } from "@/components/form";

type Person = { user_id: string; full_name: string };

const MAX = 6;

// Who runs the event, for executives on the room's Settings tab. The picks keep their order (it's the order "Run by"
// reads in) and go to the server as repeated "lead" fields. Only trainers and executives are offered; a lead who has
// since become a trainee still shows here so they can be taken off.
export function LeadsForm({
  action: serverAction,
  people,
  initial,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  people: Person[];
  initial: Person[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, {});
  const [picked, setPicked] = useState<Person[]>(initial);
  const [adding, setAdding] = useState("");
  const pickedIds = new Set(picked.map((p) => p.user_id));
  const choices = people.filter((p) => !pickedIds.has(p.user_id));
  const full = picked.length >= MAX;

  const add = () => {
    const person = people.find((p) => p.user_id === adding);
    if (!person || full) return;
    setPicked((list) => [...list, person]);
    setAdding("");
  };

  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      {picked.map((p) => (
        <input key={p.user_id} type="hidden" name="lead" value={p.user_id} />
      ))}
      {picked.length ? (
        <ol aria-label="Leads" className="border-t border-rule">
          {picked.map((p, i) => (
            <li
              key={p.user_id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-rule px-1 py-3"
            >
              <span className="min-w-0 truncate text-17 font-semibold">
                <span className="num mr-3 text-ink-2">{i + 1}</span>
                {p.full_name}
              </span>
              <Button
                variant="line"
                type="button"
                className="h-11 px-4"
                onClick={() => setPicked((list) => list.filter((x) => x.user_id !== p.user_id))}
                aria-label={`Take ${p.full_name} off`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-16 text-ink-2">Nobody yet. The person who made the event shows as running it.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Select
          label="Add a lead"
          name="add"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          disabled={full || choices.length === 0}
        >
          <option value="">Pick someone</option>
          {choices.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.full_name}
            </option>
          ))}
        </Select>
        <Button variant="line" type="button" onClick={add} disabled={!adding || full}>
          Add
        </Button>
      </div>
      <p className="-mt-2 text-15 text-ink-2">
        {full ? `${MAX} is the most.` : "Trainers and executives. Save to make it count."}
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save leads"}
        </Button>
      </div>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
    </form>
  );
}
