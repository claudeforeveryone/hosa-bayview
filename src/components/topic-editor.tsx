"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { FormState } from "@/app/(app)/c/actions";
import { TopicBar, TopicTotal } from "@/components/topic-breakdown";
import { Button, FormMessage } from "@/components/form";
import { topicTotal, type TopicInput } from "@/lib/resources";

type Row = TopicInput & { key: number };

const inputClass =
  "step h-12 w-full border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]";

// Edits the whole event breakdown at once. The total updates as you type; saving replaces the list.
export function TopicEditor({
  action,
  initial,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial: TopicInput[];
}) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((r, key) => ({ ...r, key })));
  const nextKey = useRef(initial.length);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const uid = useId();

  const patch = (key: number, change: Partial<TopicInput>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const add = () => setRows((rs) => [...rs, { key: nextKey.current++, topic: "", percent: "" }]);

  const total = topicTotal(rows.map((r) => ({ percent: Number(r.percent) || 0 })));

  return (
    <form action={formAction} className="grid max-w-2xl gap-6" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <ul className="grid gap-5">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_6rem] gap-x-3 gap-y-2">
            <label htmlFor={`${uid}-topic-${r.key}`} className="sr-only">
              Topic {i + 1}
            </label>
            <input
              id={`${uid}-topic-${r.key}`}
              name="topic"
              value={r.topic}
              maxLength={80}
              placeholder="Topic"
              onChange={(e) => patch(r.key, { topic: e.target.value })}
              className={inputClass}
            />
            <label htmlFor={`${uid}-percent-${r.key}`} className="sr-only">
              Percent for topic {i + 1}
            </label>
            <input
              id={`${uid}-percent-${r.key}`}
              name="percent"
              value={r.percent}
              inputMode="numeric"
              maxLength={3}
              placeholder="%"
              onChange={(e) => patch(r.key, { percent: e.target.value.replace(/\D/g, "") })}
              className={`num ${inputClass}`}
            />
            <div className="col-span-2 flex items-center gap-4">
              <span className="min-w-0 flex-1">
                <TopicBar percent={Number(r.percent) || 0} />
              </span>
              <button
                type="button"
                onClick={() => remove(r.key)}
                className="caps step h-10 shrink-0 px-2 text-[15px] text-ink-2 hover:text-ink"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button type="button" variant="line" onClick={add}>
          Add topic
        </Button>
        <TopicTotal total={total} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save breakdown"}
        </Button>
        {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
      </div>
    </form>
  );
}
