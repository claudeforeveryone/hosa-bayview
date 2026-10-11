"use client";

import { useState, useTransition } from "react";
import { setGifUser } from "./actions";

// On/off for one person's GIF picture permission (0108). Shown only to the executives who may hand it out.
export function GifSwitch({ userId, name, allowed }: { userId: string; name: string; allowed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (next: boolean) => {
    if (next === allowed || pending) return;
    setError(null);
    start(async () => {
      let result;
      try {
        result = await setGifUser(userId, next);
      } catch {
        result = { error: "Couldn't change that. Try again." };
      }
      if (result.error) setError(result.error);
    });
  };

  return (
    <div className="grid justify-items-start gap-2">
      <div role="group" aria-label={`GIF pictures for ${name}`} className="flex border border-ink" aria-busy={pending}>
        {[
          { value: false, label: "No GIFs" },
          { value: true, label: "GIFs allowed" },
        ].map((o) => {
          const current = o.value === allowed;
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={current}
              disabled={pending}
              onClick={() => pick(o.value)}
              className={`caps step h-10 min-w-[4.75rem] px-3 text-14 not-first:border-l not-first:border-ink disabled:opacity-60 ${
                current ? "cursor-default bg-ink text-ground" : "hover:bg-band"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-14 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
