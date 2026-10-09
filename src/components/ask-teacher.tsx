"use client";

import { useState, useTransition } from "react";
import { askTeacher } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";

export type FlagState = {
  id: string;
  note: string;
  status: "open" | "answered";
  reply: string;
};

// Ask teacher on one question: a short optional note, then the trainer's reply once it's in.
export function AskTeacher({
  testId,
  questionId,
  flag,
}: {
  testId: string;
  questionId: string;
  flag: FlagState | null;
}) {
  const [current, setCurrent] = useState<FlagState | null>(flag);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(flag?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () => {
    setError(null);
    start(async () => {
      const r = await askTeacher(testId, questionId, note);
      if (r.error || !r.id) {
        setError(r.error ?? "That didn't send. Try again.");
        return;
      }
      setCurrent({ id: r.id, note: note.trim(), status: "open", reply: "" });
      setEditing(false);
    });
  };

  if (editing) {
    return (
      <form
        className="grid max-w-2xl gap-3 border-t border-dashed border-rule-strong pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        noValidate
      >
        <label
          htmlFor={`ask-${questionId}`}
          className="text-[15px] font-medium"
        >
          Ask your teacher
        </label>
        <input
          id={`ask-${questionId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Optional: what's unclear?"
          className="step h-12 w-full border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
        />
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Sending" : "Send"}
          </Button>
          <Button
            type="button"
            variant="line"
            onClick={() => setEditing(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid max-w-2xl gap-2 border-t border-dashed border-rule-strong pt-4">
      {current ? (
        <div className="grid gap-1">
          {current.status === "answered" ? (
            <>
              <p className="caps text-[14px] text-ink-2">Teacher replied</p>
              <p className="whitespace-pre-line text-[17px]">
                {current.reply || "Marked answered."}
              </p>
            </>
          ) : (
            <>
              <p className="caps text-[14px] text-ink-2">
                Asked. Waiting for a reply.
              </p>
              {current.note ? (
                <p className="whitespace-pre-line text-ink-2">{current.note}</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {/* Once the trainer has replied, the thread is closed: asking again would drop their reply. */}
      {current?.status !== "answered" ? (
        <div>
          <button
            type="button"
            onClick={() => {
              setNote(current?.note ?? "");
              setEditing(true);
            }}
            className="caps step inline-flex h-10 items-center border border-ink px-4 text-[15px] hover:bg-band"
          >
            {current ? "Ask again" : "Ask teacher"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
