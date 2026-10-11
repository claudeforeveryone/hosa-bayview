"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { replyToFlag } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";
import { isReportReason, reasonLabel } from "@/lib/flag-reasons";
import type { ClassroomFlag, TestFlag } from "@/lib/tests";

type RowFlag = Pick<
  TestFlag,
  "id" | "full_name" | "pos" | "prompt" | "note" | "reason"
>;

// Open Ask teacher questions and question reports (0231) land in the same list: a report is an Ask teacher thread
// with a reason, tagged "Reported: ..." on its row. The headings say both so a trainer knows reports come here.
// `readOnly` (dev gallery only) shows the rows with the reply switched off.
const HEADING = "Ask teacher and reports";

// The test page's section: everything open on this test, for the trainer to answer.
export function TestFlagsSection({
  testId,
  flags,
  readOnly = false,
}: {
  testId: string;
  flags: TestFlag[];
  readOnly?: boolean;
}) {
  return (
    <section aria-labelledby="asks-h" className="grid gap-3">
      <h3
        id="asks-h"
        className="flex flex-wrap items-baseline gap-x-3 gap-y-2 font-display text-[28px] leading-none font-bold uppercase"
      >
        {HEADING}
        <span className="num border border-ink px-2 py-0.5 font-sans text-[16px] font-semibold tracking-normal">
          {flags.length}
        </span>
      </h3>
      <FlagList testId={testId} flags={flags} readOnly={readOnly} />
    </section>
  );
}

// The classroom hub's panel, folded so it doesn't push the page down; `open` comes from ?asks=1.
export function ClassroomFlagsPanel({
  classroomId,
  flags,
  open,
  readOnly = false,
}: {
  classroomId: string;
  flags: ClassroomFlag[];
  open: boolean;
  readOnly?: boolean;
}) {
  return (
    <details className="group border-[3px] border-ink" open={open}>
      <summary className="caps step flex min-h-14 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[17px] hover:bg-band [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3">
          {HEADING}
          <span
            className={`num px-2 py-0.5 font-sans text-[15px] font-semibold tracking-normal ${flags.length ? "bg-you text-on-you" : "border border-rule-strong text-ink-2"}`}
          >
            {flags.length}
          </span>
          <span className="sr-only">open</span>
        </span>
        <ChevronDown
          size={22}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 group-open:rotate-180"
        />
      </summary>
      <div className="border-t-2 border-ink px-1 pt-2 pb-4 sm:px-3">
        <ClassroomFlagList
          classroomId={classroomId}
          flags={flags}
          readOnly={readOnly}
        />
      </div>
    </details>
  );
}

// Open questions and reports on one test. The trainer replies (optional) and marks each answered.
export function FlagList({
  testId,
  flags,
  readOnly = false,
}: {
  testId: string;
  flags: TestFlag[];
  readOnly?: boolean;
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const open = flags.filter((f) => !done.has(f.id));

  if (!open.length) {
    return (
      <p className="border-y border-rule-strong px-1 py-4 text-ink-2">
        No open questions or reports.
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
          readOnly={readOnly}
          onAnswered={() => setDone((s) => new Set(s).add(f.id))}
        />
      ))}
    </ol>
  );
}

// Open questions and reports across a classroom's tests, on the classroom page. Each row names its test.
export function ClassroomFlagList({
  classroomId,
  flags,
  readOnly = false,
}: {
  classroomId: string;
  flags: ClassroomFlag[];
  readOnly?: boolean;
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const open = flags.filter((f) => !done.has(f.id));

  if (!open.length) {
    return (
      <p className="border-y border-rule-strong px-1 py-4 text-ink-2">
        No open questions or reports. When a member taps Ask teacher or reports
        a question, it shows up here and in your notifications.
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
          test={{
            href: `/c/${classroomId}/tests/${f.test_id}`,
            title: f.test_title,
          }}
          readOnly={readOnly}
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
  readOnly,
  onAnswered,
}: {
  testId: string;
  flag: RowFlag;
  test?: { href: string; title: string };
  readOnly: boolean;
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
              <Link
                href={test.href}
                className="underline decoration-rule-strong underline-offset-4 hover:text-ink"
              >
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
          disabled={readOnly}
          className="step min-h-20 w-full resize-y border border-rule-strong bg-transparent px-3 py-2.5 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
        />
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <div>
          <Button type="submit" variant="line" disabled={readOnly || pending}>
            {pending ? "Saving" : "Mark answered"}
          </Button>
        </div>
      </form>
    </li>
  );
}
