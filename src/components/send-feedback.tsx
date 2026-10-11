"use client";

import { useId, useRef, useState, useTransition } from "react";
import { sendFeedback } from "@/app/(app)/settings/feedback-action";
import { Button, FormMessage } from "@/components/form";
import {
  CATEGORY_LABEL,
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX,
  type FeedbackCategory,
} from "@/lib/owner-metrics";

// Settings > Account > Send feedback: what kind it is, then a few words. It goes to the owner console's queue,
// which every stats viewer reads with the sender's name (FEEDBACK_DESCRIPTION says so to members).
// `readOnly` is for the dev gallery screenshot: the form shows but can't send.
export function SendFeedback({ readOnly = false }: { readOnly?: boolean }) {
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [pending, start] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const send = () => {
    setMessage(null);
    start(async () => {
      const r = await sendFeedback(category, body);
      if (r.error) {
        setMessage({ tone: "error", text: r.error });
        field.current?.focus();
        return;
      }
      setBody("");
      setMessage({ tone: "ok", text: r.ok ?? "Sent." });
    });
  };

  return (
    <form
      className="grid max-w-2xl gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly) send();
      }}
      noValidate
    >
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[15px] font-medium">What is it?</legend>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_CATEGORIES.map((c) => (
            <label
              key={c}
              className={`caps step inline-flex h-11 cursor-pointer items-center border px-4 text-[15px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                category === c
                  ? "border-ink bg-ink text-ground"
                  : "border-rule-strong text-ink hover:bg-band"
              }`}
            >
              <input
                type="radio"
                name={`${id}-category`}
                value={c}
                checked={category === c}
                onChange={() => setCategory(c)}
                className="sr-only"
              />
              {CATEGORY_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-body`} className="text-[15px] font-medium">
          {category === "bug"
            ? "What happened, and where?"
            : category === "idea"
              ? "What would make it better?"
              : "What's on your mind?"}
        </label>
        <textarea
          id={`${id}-body`}
          ref={field}
          value={body}
          maxLength={FEEDBACK_MAX}
          rows={4}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby={`${id}-hint`}
          className="step w-full resize-y border border-rule-strong bg-transparent px-3 py-2 text-[17px] outline-none focus:border-ink"
        />
        <p id={`${id}-hint`} className="text-[14px] text-ink-2">
          Skip passwords and anything private. Up to 1,000 characters.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || readOnly}>
          {pending ? "Sending" : "Send feedback"}
        </Button>
        {message ? (
          <FormMessage tone={message.tone}>{message.text}</FormMessage>
        ) : null}
      </div>
    </form>
  );
}
