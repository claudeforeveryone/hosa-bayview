"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { updateName } from "@/app/(app)/settings/actions";

const HEADING =
  "font-display text-[clamp(2.5rem,8vw,4.5rem)] leading-none font-bold [overflow-wrap:anywhere] uppercase";

// Your name as the page heading. Tap it to edit in place: Enter or leaving the field saves, Esc cancels.
// Saving goes through the same action as Settings, so the same rules apply.
export function NameEdit({ name }: { name: string }) {
  const [saved, setSaved] = useState(name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Esc and Enter both end editing; the blur that follows must not save a second time.
  const done = useRef(false);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  function open() {
    done.current = false;
    setDraft(saved);
    setError(null);
    setStatus(null);
    setEditing(true);
  }

  function cancel() {
    done.current = true;
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => button.current?.focus());
  }

  function save() {
    if (done.current) return;
    const value = draft.trim();
    if (value === saved) {
      cancel();
      return;
    }
    done.current = true;
    const form = new FormData();
    form.set("full_name", value);
    startTransition(async () => {
      const res = await updateName({}, form).catch(() => ({ error: "Couldn't save that. Try again." }));
      const problem = ("fieldErrors" in res ? res.fieldErrors?.full_name : undefined) ?? res.error;
      if (problem) {
        // Stay in the field so the fix is one keystroke away.
        done.current = false;
        setError(problem);
        requestAnimationFrame(() => input.current?.focus());
        return;
      }
      const next = ("values" in res ? res.values?.full_name : undefined) ?? value;
      setSaved(next);
      setEditing(false);
      setStatus("Name saved.");
      requestAnimationFrame(() => button.current?.focus());
    });
  }

  if (editing) {
    return (
      <div className="grid gap-2">
        <label htmlFor="profile-name" className="caps text-14 text-ink-2">
          Your name
        </label>
        <input
          id="profile-name"
          ref={input}
          value={draft}
          maxLength={60}
          disabled={pending}
          autoComplete="name"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby="profile-name-hint"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className={`${HEADING} w-full min-w-0 border-b-[3px] border-ink bg-transparent pb-1 outline-none aria-invalid:border-danger disabled:opacity-60`}
        />
        <p id="profile-name-hint" className={`text-15 ${error ? "text-danger" : "text-ink-2"}`}>
          {error ?? (pending ? "Saving" : "Enter saves, Esc cancels.")}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <h1 className="m-0">
        <button
          ref={button}
          type="button"
          onClick={open}
          aria-label={`${saved}. Edit your name`}
          className={`${HEADING} group inline text-left decoration-[3px] underline-offset-[0.12em] hover:underline focus-visible:underline focus-visible:outline-none`}
        >
          {saved}
          <Pencil
            size={22}
            strokeWidth={2}
            aria-hidden
            className="ml-2 inline-block align-middle text-ink-2 group-hover:text-ink"
          />
        </button>
      </h1>
      <p role="status" className="text-15 text-ink-2">
        {status}
      </p>
    </div>
  );
}
