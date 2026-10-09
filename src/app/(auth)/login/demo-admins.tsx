"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { FormMessage } from "@/components/form";
import { demoLogin } from "../actions";

// One tap signs in as that demo executive.
export function DemoAdmins({ people }: { people: { slug: string; full_name: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section aria-labelledby="demo-h" className="grid gap-3">
      <h2 id="demo-h" className="caps text-[15px] text-ink-2">
        Admins
      </h2>
      <ul className="grid grid-cols-1 gap-2">
        {people.map((p) => (
          <li key={p.slug}>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setWho(p.slug);
                start(async () => {
                  const r = await demoLogin(p.slug);
                  if (r?.error) setError(r.error);
                });
              }}
              className="step flex h-full min-h-16 w-full items-center justify-between gap-2 bg-field px-4 py-3 text-left text-on-field hover:bg-field-2 disabled:opacity-70"
            >
              <span className="font-display text-[22px] leading-none font-semibold uppercase">
                {pending && who === p.slug ? "Signing in" : p.full_name}
              </span>
              <ArrowRight size={18} strokeWidth={2} className="shrink-0" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </section>
  );
}
