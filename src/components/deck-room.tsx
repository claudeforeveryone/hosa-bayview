"use client";

import { useState, useTransition } from "react";
import { moveDeck } from "@/app/(app)/flashcards/actions";
import type { FormState } from "@/app/(app)/c/actions";
import { FormMessage } from "@/components/form";

// Which classroom a deck belongs to. A deck has to be in a classroom before it can be shared there.
export function DeckRoom({
  deckId,
  current,
  rooms,
}: {
  deckId: string;
  current: string | null;
  rooms: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(current ?? "");
  const [result, setResult] = useState<FormState>({});
  const [pending, start] = useTransition();

  return (
    <div className="grid justify-items-start gap-2">
      <label htmlFor="deck-room" className="text-[16px] text-ink-2">
        Event
      </label>
      <select
        id="deck-room"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const before = value;
          setValue(next);
          start(async () => {
            const r = await moveDeck(deckId, next || null);
            setResult(r);
            if (r.error) setValue(before);
          });
        }}
        className="step h-12 w-full max-w-sm border border-rule-strong bg-ground px-3 text-[17px]"
      >
        <option value="">None (only you)</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {pending ? <p className="text-[15px] text-ink-2">Saving</p> : null}
      {result.error ? <FormMessage tone="error">{result.error}</FormMessage> : null}
      {result.ok ? <FormMessage tone="ok">{result.ok}</FormMessage> : null}
    </div>
  );
}
