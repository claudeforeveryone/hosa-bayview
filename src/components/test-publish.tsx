"use client";

import { useState, useTransition } from "react";
import { setPublished } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";

export function TestPublish({ testId, published }: { testId: string; published: boolean }) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid justify-items-start gap-2">
      <Button
        type="button"
        variant={published ? "line" : "solid"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setPublished(testId, !published);
            setMessage(r.error ? { tone: "error", text: r.error } : r.ok ? { tone: "ok", text: r.ok } : null);
          })
        }
      >
        {pending ? "Saving" : published ? "Hide from members" : "Post"}
      </Button>
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
    </div>
  );
}
