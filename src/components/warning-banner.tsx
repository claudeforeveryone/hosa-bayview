"use client";

import { useState, useTransition } from "react";
import { acknowledgeWarning } from "@/app/(app)/warning-actions";

// The oldest unseen warning, across the top of the app until the member clicks "Got it".
export function WarningBanner({
  id,
  message,
}: {
  id: string;
  message: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      aria-labelledby="warning-h"
      className="grid gap-3 bg-field px-4 py-4 text-on-field sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-8 lg:px-12"
    >
      <div className="grid gap-1">
        <h2 id="warning-h" className="caps text-15">
          Warning from the executives
        </h2>
        <p className="text-17 leading-snug [overflow-wrap:anywhere]">
          {message}
        </p>
        {error ? (
          <p role="alert" className="text-15">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await acknowledgeWarning(id);
            if (result.error) setError(result.error);
          })
        }
        className="caps step h-11 shrink-0 bg-on-field px-5 text-17 text-field hover:bg-field-2 hover:text-on-field disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving" : "Got it"}
      </button>
    </section>
  );
}
