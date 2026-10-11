"use client";

import { useActionState, useId, useState } from "react";
import {
  warnMember,
  type ModState,
} from "@/app/(app)/admin/moderation-actions";
import { Button, FormMessage, TextArea } from "@/components/form";
import { defaultAbsenceWarning, type AbsenceRow } from "@/lib/meetings";

// warnable is false for executives (the database refuses them) and for demo accounts. Missing means warnable.
export type WarnableRow = AbsenceRow & { warnable?: boolean };

// Ranked most absences. Executives see a Warn action on each row; trainers get the list view only, since
// the database only lets executives warn (warn_member).
export function AbsenceList({
  rows,
  canWarn,
  empty,
}: {
  rows: WarnableRow[];
  canWarn: boolean;
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="text-17 text-ink-2">{empty}</p>;
  return (
    <ol className="border-t border-rule">
      {rows.map((r, i) => (
        <AbsenceRowItem
          key={r.user_id}
          row={r}
          rank={i + 1}
          canWarn={canWarn}
        />
      ))}
    </ol>
  );
}

function AbsenceRowItem({
  row,
  rank,
  canWarn,
}: {
  row: WarnableRow;
  rank: number;
  canWarn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="border-b border-rule">
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 sm:px-3">
        <span className="num text-16 text-ink-2">{rank}</span>
        <span className="min-w-0">
          <span className="block truncate text-18 font-medium">
            {row.name}
          </span>
          <span className="num block text-15 text-ink-2">
            of {row.counted} counted
          </span>
        </span>
        <div className="flex items-center gap-3">
          <span className="num text-right font-display text-28 leading-none font-bold">
            {row.absent}
            <span className="caps ml-1.5 text-14 font-medium text-ink-2">
              absent
            </span>
          </span>
          {canWarn && row.warnable !== false ? (
            <Button
              type="button"
              variant="line"
              aria-expanded={open}
              aria-controls={`${id}-warn`}
              onClick={() => setOpen((v) => !v)}
              className="min-h-11 min-w-11 px-4"
            >
              {open ? "Close" : "Warn"}
            </Button>
          ) : null}
        </div>
      </div>
      {canWarn && row.warnable !== false && open ? (
        <div id={`${id}-warn`} className="px-1 pb-5 sm:px-3">
          <WarnBox userId={row.user_id} name={row.name} absent={row.absent} />
        </div>
      ) : null}
    </li>
  );
}

// The warning goes through the same warn_member RPC as the person dialog, so it shows on the member's screen.
function WarnBox({
  userId,
  name,
  absent,
}: {
  userId: string;
  name: string;
  absent: number;
}) {
  const [state, action, pending] = useActionState<ModState, FormData>(
    warnMember,
    {},
  );
  const [message, setMessage] = useState(() => defaultAbsenceWarning(absent));
  return (
    <form
      action={action}
      className="grid max-w-xl gap-4 border-t border-rule pt-4"
      noValidate
    >
      <input type="hidden" name="userId" value={userId} />
      <TextArea
        label={`Warning for ${name}`}
        name="message"
        required
        maxLength={500}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        hint="Shows at the top of their screen until they click Got it."
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending || message.trim() === ""}>
          {pending ? "Sending" : "Send warning"}
        </Button>
      </div>
      {state.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      {state.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
    </form>
  );
}
