"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { displayCode } from "@/lib/join-code";

type Note = { kind: "copied" | "copy-failed" | "regenerated" | "error"; text: string };

// The join code for people who run the room: big enough to read off a projector, one tap to copy.
export function CodeStrip({ code, regenerate }: { code: string; regenerate: () => Promise<FormState> }) {
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Every status message clears itself, so a stale result never comes back after a newer one.
  function flash(next: Note) {
    clearTimeout(timer.current);
    setNote(next);
    timer.current = setTimeout(() => setNote(null), 3000);
  }

  const [, run, pending] = useActionState<FormState>(async () => {
    const result = await regenerate();
    flash(result.error ? { kind: "error", text: result.error } : { kind: "regenerated", text: result.ok ?? "New code is live." });
    return result;
  }, {});

  // Arming swaps buttons; keep keyboard focus on the safe choice, then back on the trigger.
  const keep = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const copyBtn = useRef<HTMLButtonElement>(null);
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) keep.current?.focus();
    else if (wasArmed.current) (trigger.current && !trigger.current.disabled ? trigger.current : copyBtn.current)?.focus();
    wasArmed.current = armed;
  }, [armed]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      flash({ kind: "copied", text: "Code copied." });
    } catch {
      flash({ kind: "copy-failed", text: "Couldn’t copy. Read the code out instead." });
    }
  }

  const copied = note?.kind === "copied";
  const danger = note?.kind === "error" || note?.kind === "copy-failed";
  const btn = "caps step flex h-11 items-center gap-2 border border-on-field-2 px-4 text-[16px] hover:bg-on-field hover:text-field";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="flex items-baseline gap-3">
          <span className="caps text-[16px] text-on-field-2">Join code</span>
          <span className="num font-display text-[clamp(2.5rem,9vw,3.5rem)] leading-none font-bold tracking-[0.08em]">
            {displayCode(code)}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button ref={copyBtn} type="button" onClick={copy} className={btn}>
            {copied ? <Check size={18} strokeWidth={2} aria-hidden /> : <Copy size={18} strokeWidth={1.75} aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
          {armed ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(run);
                  setArmed(false);
                }}
                className="caps step flex h-11 items-center gap-2 bg-you px-4 text-[16px] text-on-you disabled:opacity-60"
              >
                <RefreshCw size={18} strokeWidth={1.75} aria-hidden />
                Kill old code
              </button>
              <button ref={keep} type="button" onClick={() => setArmed(false)} className={btn}>
                Keep it
              </button>
            </>
          ) : (
            <button ref={trigger} type="button" disabled={pending} onClick={() => setArmed(true)} className={btn}>
              <RefreshCw size={18} strokeWidth={1.75} aria-hidden />
              {pending ? "Making code" : "New code"}
            </button>
          )}
        </div>
      </div>
      <p aria-live="polite" className={`min-h-[1.5em] text-[15px] ${danger ? "text-on-field-danger" : "text-on-field-2"}`}>
        {armed ? "Old code stops working. Members stay in." : note?.text}
      </p>
    </div>
  );
}
