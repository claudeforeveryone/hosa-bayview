"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, Field, FormMessage } from "@/components/form";
import { demoLogin, type AuthState } from "../actions";

function PasswordForm({ slug, name, onCancel }: { slug: string; name: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(demoLogin.bind(null, slug), {});
  const id = `exec-pw-${slug}`;
  useEffect(() => {
    document.getElementById(id)?.focus();
  }, [id]);
  return (
    <form action={action} className="grid gap-3 border-x border-b border-field px-4 py-4" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Field
        id={id}
        label={`Executive password for ${name}`}
        name="password"
        type="password"
        autoComplete="off"
        required
        error={state.fieldErrors?.password}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in" : "Sign in"}
        </Button>
        <Button type="button" variant="line" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Tap a name, enter the executive password, and you're in as that admin.
export function DemoAdmins({ people }: { people: { slug: string; full_name: string }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <section aria-labelledby="demo-h" className="grid gap-3">
      <h2 id="demo-h" className="caps text-[15px] text-ink-2">
        Executives
      </h2>
      <ul className="grid grid-cols-1 gap-2">
        {people.map((p) => (
          <li key={p.slug}>
            <button
              ref={(el) => {
                triggers.current[p.slug] = el;
              }}
              type="button"
              aria-expanded={open === p.slug}
              onClick={() => setOpen((o) => (o === p.slug ? null : p.slug))}
              className="step flex min-h-16 w-full items-center justify-between gap-2 bg-field px-4 py-3 text-left text-on-field hover:bg-field-2"
            >
              <span className="font-display text-[22px] leading-none font-semibold uppercase">{p.full_name}</span>
              <ArrowRight
                size={18}
                strokeWidth={2}
                className={`shrink-0 ${open === p.slug ? "rotate-90" : ""}`}
                aria-hidden
              />
            </button>
            {open === p.slug ? (
              <PasswordForm
                slug={p.slug}
                name={p.full_name}
                onCancel={() => {
                  setOpen(null);
                  triggers.current[p.slug]?.focus();
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
