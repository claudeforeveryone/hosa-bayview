"use client";

import { useTransition, useState } from "react";
import { Pin, PinOff } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { FormMessage } from "@/components/form";

// One tap pins or unpins; the list re-sorts when the server answers.
export function PinButton({
  pinned,
  action,
}: {
  pinned: boolean;
  action: () => Promise<FormState>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const Icon = pinned ? PinOff : Pin;
  return (
    <div className="grid justify-items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action();
            setError(r.error ?? null);
          })
        }
        className="caps step inline-flex h-10 items-center gap-2 border border-ink px-4 text-[15px] text-ink hover:bg-band disabled:opacity-60"
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden />
        {pending
          ? pinned
            ? "Unpinning"
            : "Pinning"
          : pinned
            ? "Unpin"
            : "Pin"}
      </button>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}
