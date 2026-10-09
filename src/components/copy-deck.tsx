"use client";

import { useState, useTransition } from "react";
import { copyDeck } from "@/app/(app)/flashcards/actions";
import { Button, FormMessage } from "@/components/form";

// For decks you can't edit: makes your own copy and opens it. On success the action redirects.
export function CopyDeck({ deckId }: { deckId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid justify-items-start gap-2">
      <Button
        variant="line"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await copyDeck(deckId);
            if (r.error) setError(r.error);
          })
        }
      >
        {pending ? "Copying" : "Copy to my decks"}
      </Button>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}
