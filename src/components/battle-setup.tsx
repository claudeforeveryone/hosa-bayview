"use client";

import { useActionState, useState } from "react";
import { Swords } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, FormMessage, Select } from "@/components/form";
import {
  DEFAULT_QUESTIONS,
  FORMATS,
  QUESTION_COUNTS,
  formatLabel,
  type BattleFormat,
} from "@/lib/battle";
import type { BattleSource } from "@/lib/battles";

// Host a battle: format, what to play, how many. Three choices, sensible defaults, one button.

function Tiles<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
  label,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-[15px] font-medium">{legend}</legend>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] border-t border-l border-rule-strong">
        {options.map((o) => (
          <label
            key={String(o)}
            className="caps num step grid min-h-14 cursor-pointer place-items-center border-r border-b border-rule-strong px-2 text-[19px] hover:bg-band has-checked:bg-ink has-checked:text-ground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
          >
            <input
              type="radio"
              name={name}
              value={String(o)}
              checked={value === o}
              onChange={() => onChange(o)}
              className="sr-only"
            />
            {label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function BattleSetup({
  action,
  sources,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  sources: BattleSource[];
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const [format, setFormat] = useState<BattleFormat>(
    (FORMATS as readonly string[]).includes(state.values?.format ?? "")
      ? (state.values!.format as BattleFormat)
      : "1v1",
  );
  const [count, setCount] = useState<number>(
    Number(state.values?.count) || DEFAULT_QUESTIONS,
  );
  // Tests that hide answers or cap attempts are listed by the server but can't be battled (their keys stay
  // private); say so once instead of offering them.
  const playable = sources.filter((s) => s.playable);
  const skipped = sources.length - playable.length;
  const total = playable.reduce((n, s) => n + s.questions, 0);
  return (
    <form action={submit} className="grid max-w-xl gap-7" noValidate>
      <Tiles
        legend="Format"
        name="format"
        options={FORMATS}
        value={format}
        onChange={setFormat}
        label={formatLabel}
      />
      <Select
        label="Questions from"
        name="source"
        defaultValue={state.values?.source ?? "all"}
        hint={
          skipped
            ? "Tests that hide answers or cap attempts can't be used."
            : undefined
        }
      >
        <option value="all">All questions in this event ({total})</option>
        {playable.map((s) => (
          <option key={s.test_id} value={s.test_id}>
            {s.title} ({s.questions})
          </option>
        ))}
      </Select>
      <Tiles
        legend="How many"
        name="count"
        options={QUESTION_COUNTS}
        value={count}
        onChange={setCount}
        label={String}
      />
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-16 w-full text-[20px]"
      >
        <Swords size={22} strokeWidth={1.75} aria-hidden />
        {pending ? "Making it" : "Get a code"}
      </Button>
    </form>
  );
}
