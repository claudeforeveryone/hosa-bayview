"use client";

import { useId, useState, useTransition } from "react";
import { triageFeedback } from "@/app/(app)/developer/actions";
import { Button, FormMessage } from "@/components/form";
import {
  CATEGORY_LABEL,
  FEEDBACK_MAX,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  stampText,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/lib/owner-metrics";
import type { FeedbackRow } from "@/lib/owner-types";

const field =
  "step h-12 w-full border border-rule-strong bg-ground px-2 text-[16px] text-ink outline-none focus:border-ink disabled:opacity-60";

// One piece of feedback with its triage controls. Saving writes the change and an audit row (the member never
// sees the note). In the dev gallery the controls show but are switched off, so nothing is written.
export function FeedbackTriage({
  row,
  readOnly = false,
}: {
  row: FeedbackRow;
  readOnly?: boolean;
}) {
  const [status, setStatus] = useState<FeedbackStatus>(row.status);
  const [priority, setPriority] = useState<FeedbackPriority>(row.priority);
  const [resolution, setResolution] = useState(row.resolution);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  const changed =
    status !== row.status ||
    priority !== row.priority ||
    resolution.trim() !== row.resolution;

  const save = () => {
    setMessage(null);
    start(async () => {
      const r = await triageFeedback(row.id, status, priority, resolution);
      setMessage(
        r.error
          ? { tone: "error", text: r.error }
          : { tone: "ok", text: "Saved." },
      );
    });
  };

  return (
    <li
      id={`feedback-${row.id.slice(0, 8)}`}
      className="grid scroll-mt-6 gap-4 border-b border-rule py-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="caps border border-ink px-2 py-0.5 text-[13px]">
          {CATEGORY_LABEL[row.category]}
        </span>
        {row.priority === "high" ? (
          <span className="caps bg-ink px-2 py-0.5 text-[13px] text-ground">
            High
          </span>
        ) : null}
        <span className="text-[15px] text-ink-2">
          {row.sent_by} · {stampText(row.created_at)}
          {row.build ? ` · build ${row.build.slice(0, 7)}` : ""}
        </span>
      </div>
      <p className="max-w-[70ch] text-[17px] whitespace-pre-line [overflow-wrap:anywhere]">
        {row.body}
      </p>
      <form
        className="grid max-w-3xl gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-status`} className="text-[15px] font-medium">
              Status
            </label>
            <select
              id={`${id}-status`}
              value={status}
              disabled={readOnly || pending}
              onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
              className={field}
            >
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label
              htmlFor={`${id}-priority`}
              className="text-[15px] font-medium"
            >
              Priority
            </label>
            <select
              id={`${id}-priority`}
              value={priority}
              disabled={readOnly || pending}
              onChange={(e) => setPriority(e.target.value as FeedbackPriority)}
              className={field}
            >
              {FEEDBACK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-note`} className="text-[15px] font-medium">
            Resolution note{" "}
            <span className="font-normal text-ink-2">(only you see it)</span>
          </label>
          <textarea
            id={`${id}-note`}
            value={resolution}
            maxLength={FEEDBACK_MAX}
            rows={2}
            disabled={readOnly || pending}
            onChange={(e) => setResolution(e.target.value)}
            className="step w-full resize-y border border-rule-strong bg-transparent px-3 py-2 text-[16px] outline-none focus:border-ink disabled:opacity-60"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="line"
            disabled={readOnly || pending || !changed}
          >
            {pending ? "Saving" : "Save"}
          </Button>
          {row.triaged_at ? (
            <span className="text-[14px] text-ink-2">
              Last triaged {stampText(row.triaged_at)}
            </span>
          ) : null}
          {message ? (
            <FormMessage tone={message.tone}>{message.text}</FormMessage>
          ) : null}
        </div>
      </form>
    </li>
  );
}
