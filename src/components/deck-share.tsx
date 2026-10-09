"use client";

import { useState, useTransition } from "react";
import { setShared } from "@/app/(app)/flashcards/actions";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, FormMessage } from "@/components/form";

// Owners and classroom trainers flip a classroom deck between shared and only-you.
export function DeckShare({ deckId, shared, classroomName }: { deckId: string; shared: boolean; classroomName: string }) {
  const [on, setOn] = useState(shared);
  const [result, setResult] = useState<FormState>({});
  const [pending, start] = useTransition();

  return (
    <div className="grid justify-items-start gap-3">
      <p className="text-[17px]">
        {on ? `Shared with everyone in ${classroomName}.` : `Only you can see this. Share it to ${classroomName} to let classmates study it.`}
      </p>
      <Button
        variant="line"
        disabled={pending}
        aria-pressed={on}
        onClick={() =>
          start(async () => {
            const next = !on;
            const r = await setShared(deckId, next);
            setResult(r);
            if (!r.error) setOn(next);
          })
        }
      >
        {pending ? "Saving" : on ? "Stop sharing" : "Share with classroom"}
      </Button>
      {result.error ? <FormMessage tone="error">{result.error}</FormMessage> : null}
      {result.ok ? <FormMessage tone="ok">{result.ok}</FormMessage> : null}
    </div>
  );
}
