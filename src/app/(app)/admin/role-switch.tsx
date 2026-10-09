"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { Role } from "@/lib/auth";
import { setRole, type RoleState } from "./actions";

const ROLES: { value: Role; label: string }[] = [
  { value: "trainee", label: "Trainee" },
  { value: "trainer", label: "Trainer" },
  { value: "executive", label: "Exec" },
];
const NAME: Record<Role, string> = { trainee: "a trainee", trainer: "a trainer", executive: "an executive" };

// Three-way switch: the current role is filled. Picking another one asks once before it saves.
export function RoleSwitch({ userId, name, role, isMe }: { userId: string; name: string; role: Role; isMe: boolean }) {
  const [picked, setPick] = useState<Role | null>(null);
  // A pick that already matches the saved role (changed elsewhere) is no pick at all.
  const pick = picked && picked !== role ? picked : null;
  const [error, setError] = useState<string | null>(null);
  const promptId = useId();
  // Which switch button to land on when the prompt closes (the one that opened it, or the saved role).
  const returnTo = useRef<Role | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const switchRef = useRef<HTMLDivElement>(null);

  const [, action, pending] = useActionState<RoleState, FormData>(async (prev, form) => {
    let result: RoleState;
    try {
      result = await setRole(userId, prev, form);
    } catch {
      result = { error: "Couldn't change that. Try again." };
    }
    setError(result.error ?? null);
    // Keep the keyboard on the prompt after a failed save.
    if (result.error) requestAnimationFrame(() => confirmRef.current?.focus());
    if (!result.error) {
      returnTo.current = form.get("role") as Role;
      setPick(null);
    }
    return result;
  }, {});

  useEffect(() => {
    if (pick) {
      confirmRef.current?.focus();
    } else if (returnTo.current) {
      switchRef.current?.querySelector<HTMLButtonElement>(`[data-role="${returnTo.current}"]`)?.focus();
      returnTo.current = null;
    }
  }, [pick]);

  const cancel = () => {
    setError(null);
    returnTo.current = pick;
    setPick(null);
  };

  return (
    <form action={action} className="grid justify-items-start gap-2 sm:justify-items-end">
      {pick ? (
        <div
          role="group"
          aria-labelledby={promptId}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !pending) cancel();
          }}
          className="grid justify-items-start gap-2 sm:justify-items-end"
        >
          <p id={promptId} className="text-[15px]">
            Make {isMe ? "yourself" : name} {NAME[pick]}?
          </p>
          <div className="flex gap-2">
            <button
              ref={confirmRef}
              type="submit"
              name="role"
              value={pick}
              aria-disabled={pending}
              onClick={(e) => {
                if (pending) e.preventDefault();
              }}
              className="caps step h-10 bg-ink px-4 text-[14px] text-ground hover:bg-ink-2 aria-disabled:opacity-60"
            >
              {pending ? "Saving" : "Yes, change it"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="caps step h-10 border border-ink px-4 text-[14px] hover:bg-band"
            >
              Keep {ROLES.find((r) => r.value === role)?.label}
            </button>
          </div>
        </div>
      ) : (
        <div ref={switchRef} role="group" aria-label={`Role for ${name}`} className="flex border border-ink">
          {ROLES.map((r) => {
            const current = r.value === role;
            return (
              <button
                key={r.value}
                type="button"
                data-role={r.value}
                aria-pressed={current}
                onClick={() => {
                  if (current) return;
                  setError(null);
                  setPick(r.value);
                }}
                className={`caps step h-10 min-w-[4.75rem] px-3 text-[14px] not-first:border-l not-first:border-ink ${
                  current ? "cursor-default bg-ink text-ground" : "hover:bg-band"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-[14px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
