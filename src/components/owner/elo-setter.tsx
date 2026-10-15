"use client";

import { useId, useState, useTransition } from "react";
import { setElo, type EloResult } from "@/app/(app)/developer/actions";
import { Button, Field, FormMessage, Select } from "@/components/form";

type Member = { user_id: string; full_name: string; elo: number };

// Developers only (the console is theirs, and dev_set_elo checks again, 0292). Sets a member's chapter Elo to a
// number; the difference goes into the Elo ledger, so boards, Home and member pages all show it.
export function EloSetter({ members }: { members: Member[] }) {
  const id = useId();
  const sorted = [...members].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const [who, setWho] = useState("");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<EloResult>({});
  const [pending, start] = useTransition();
  const current = sorted.find((m) => m.user_id === who);
  const target = Number(value.replace(/[,\s]/g, ""));
  const valid = value.trim() !== "" && Number.isInteger(target) && target >= 0 && target <= 1_000_000;

  return (
    <section aria-labelledby={`${id}-h`} className="grid gap-4 border-[3px] border-ink p-4 sm:p-5">
      <div className="grid gap-1">
        <h3 id={`${id}-h`} className="font-display text-24 leading-none font-bold uppercase">
          Set Elo
        </h3>
        <p className="text-15 text-ink-2">
          Changes the member&apos;s Elo everywhere it shows. Logged in the admin log.
        </p>
      </div>
      <form
        className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!current || !valid) return;
          start(async () => setResult(await setElo(current.user_id, target)));
        }}
      >
        <Select
          label="Member"
          name="member"
          id={`${id}-member`}
          value={who}
          onChange={(e) => {
            setWho(e.target.value);
            const m = sorted.find((x) => x.user_id === e.target.value);
            setValue(m ? String(m.elo) : "");
            setResult({});
          }}
        >
          <option value="">Pick a member</option>
          {sorted.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name} ({m.elo.toLocaleString("en-CA")})
            </option>
          ))}
        </Select>
        <Field
          label="New Elo"
          name="elo"
          id={`${id}-elo`}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setResult({});
          }}
          disabled={!current}
        />
        <Button type="submit" disabled={!current || !valid || pending || target === current?.elo}>
          {pending ? "Saving" : "Set"}
        </Button>
      </form>
      {value.trim() !== "" && !valid ? (
        <FormMessage tone="error">Pick a whole number from 0 to 1,000,000.</FormMessage>
      ) : null}
      {result.error ? <FormMessage tone="error">{result.error}</FormMessage> : null}
      {result.ok ? <FormMessage tone="ok">{result.ok}</FormMessage> : null}
    </section>
  );
}
