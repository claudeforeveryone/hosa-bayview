"use client";

import { useState, useTransition } from "react";
import { replyToFlag } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";
import type { TestFlag } from "@/lib/tests";

// Open Ask teacher questions on one test. The trainer replies (optional) and marks each answered.
export function FlagList({
  testId,
  flags,
}: {
  testId: string;
  flags: TestFlag[];
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const open = flags.filter((f) => !done.has(f.id));

  if (!open.length) {
    return (
      <p className="border-y border-dashed border-rule-strong px-1 py-4 text-ink-2">
        No open questions.
      </p>
    );
  }

  return (
    <ol className="border-t border-rule">
      {open.map((f) => (
        <FlagRow
          key={f.id}
          testId={testId}
          flag={f}
          onAnswered={() => setDone((s) => new Set(s).add(f.id))}
        />
      ))}
    </ol>
  );
}

function FlagRow({
  testId,
  flag,
  onAnswered,
}: {
  testId: string;
  flag: TestFlag;
  onAnswered: () => void;
}) {
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () => {
    setError(null);
    start(async () => {
      const r = await replyToFlag(testId, flag.id, reply);
      if (r.error) return setError(r.error);
      onAnswered();
    });
  };

  return (
    <li className="grid gap-3 border-b border-rule py-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[17px] font-medium">{flag.full_name}</p>
        <p className="caps num text-[15px] text-ink-2">Q{flag.pos}</p>
      </div>
      <p className="whitespace-pre-line">{flag.prompt}</p>
      {flag.note ? (
        <p className="whitespace-pre-line text-ink-2">
          &ldquo;{flag.note}&rdquo;
        </p>
      ) : null}
      <form
        className="grid max-w-2xl gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        noValidate
      >
        <label htmlFor={`reply-${flag.id}`} className="text-[15px] font-medium">
          Reply <span className="font-normal text-ink-2">(optional)</span>
        </label>
        <textarea
          id={`reply-${flag.id}`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={1000}
          className="step min-h-20 w-full resize-y border border-rule-strong bg-transparent px-3 py-2.5 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
        />
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <div>
          <Button type="submit" variant="line" disabled={pending}>
            {pending ? "Saving" : "Mark answered"}
          </Button>
        </div>
      </form>
    </li>
  );
}
