"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { replyToFlag } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";
import { isReportReason, reasonLabel } from "@/lib/flag-reasons";
import type { ClassroomFlag, TestFlag } from "@/lib/tests";

type RowFlag = Pick<TestFlag, "id" | "full_name" | "pos" | "prompt" | "note" | "reason">;

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
      <p className="border-y border-rule-strong px-1 py-4 text-ink-2">
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

// Open Ask teacher questions across a classroom's tests, on the classroom page. Each row names its test.
export function ClassroomFlagList({
  classroomId,
  flags,
}: {
  classroomId: string;
  flags: ClassroomFlag[];
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const open = flags.filter((f) => !done.has(f.id));

  if (!open.length) {
    return (
      <p className="border-y border-rule-strong px-1 py-4 text-ink-2">
        No open questions. When a member taps Ask teacher, it shows up here and in your notifications.
      </p>
    );
  }

  return (
    <ol className="border-t border-rule">
      {open.map((f) => (
        <FlagRow
          key={f.id}
          testId={f.test_id}
          flag={f}
          test={{ href: `/c/${classroomId}/tests/${f.test_id}`, title: f.test_title }}
          onAnswered={() => setDone((s) => new Set(s).add(f.id))}
        />
      ))}
    </ol>
  );
}

function FlagRow({
  testId,
  flag,
  test,
  onAnswered,
}: {
  testId: string;
  flag: RowFlag;
  test?: { href: string; title: string };
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
        <p className="caps num text-[15px] text-ink-2">
          {test ? (
            <>
              <Link href={test.href} className="underline decoration-rule-strong underline-offset-4 hover:text-ink">
                {test.title}
              </Link>
              {" · "}
            </>
          ) : null}
          Q{flag.pos}
        </p>
        {/* A report (0231) says what is wrong; a plain Ask teacher has no tag. */}
        {isReportReason(flag.reason) ? (
          <p className="caps border border-ink px-2 text-[14px] leading-6">
            Reported: {reasonLabel(flag.reason)}
          </p>
        ) : null}
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
