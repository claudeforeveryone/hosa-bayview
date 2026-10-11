"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ChevronRight, Swords } from "lucide-react";
import { joinBattle } from "@/app/(app)/battle/actions";
import type { FormState } from "@/app/(app)/c/actions";
import { FormMessage } from "@/components/form";
import { formatLabel } from "@/lib/battle";
import type { OpenBattle } from "@/lib/battles";

// Live battles as rows: "Join battle" for an open lobby, "Back to battle" for one you're in.
export function OpenBattleRows({
  rows,
  showRoom = false,
}: {
  rows: OpenBattle[];
  showRoom?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <ul className="border-t border-rule">
      {rows.map((b) => (
        <li key={b.id} className="border-b border-rule">
          {b.joined ? (
            <Link href={`/battle/${b.id}`} className="step block hover:bg-band">
              <RowBody b={b} label="Back to battle" showRoom={showRoom} />
            </Link>
          ) : (
            <JoinRow b={b} showRoom={showRoom} />
          )}
        </li>
      ))}
    </ul>
  );
}

function RowBody({
  b,
  label,
  showRoom,
}: {
  b: OpenBattle;
  label: string;
  showRoom: boolean;
}) {
  const meta = [
    showRoom ? b.classroom_name : null,
    formatLabel(b.format),
    `${b.players} in`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-1 py-3 sm:px-3">
      <span className="grid gap-0.5">
        <span className="caps text-17 font-semibold">{label}</span>
        <span className="num text-15 text-ink-2 [overflow-wrap:anywhere]">
          {meta}
        </span>
      </span>
      <span className="num font-display text-24 font-bold tracking-[0.08em]">
        {b.code}
      </span>
      <ChevronRight
        size={20}
        strokeWidth={1.75}
        aria-hidden
        className="text-ink-2"
      />
    </span>
  );
}

function JoinRow({ b, showRoom }: { b: OpenBattle; showRoom: boolean }) {
  const [state, action, pending] = useActionState<FormState>(
    () => joinBattle(b.id),
    {},
  );
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        className="step block w-full text-left hover:bg-band disabled:opacity-60"
      >
        <RowBody
          b={b}
          label={pending ? "Joining" : "Join battle"}
          showRoom={showRoom}
        />
      </button>
      {state.error ? (
        <div className="px-1 pb-3 sm:px-3">
          <FormMessage tone="error">{state.error}</FormMessage>
        </div>
      ) : null}
    </form>
  );
}

// The event page's entry: live battles, then one Battle button.
export function BattleEntry({
  classroomId,
  rows,
}: {
  classroomId: string;
  rows: OpenBattle[];
}) {
  return (
    <section aria-label="Battle" className="grid gap-3">
      <OpenBattleRows rows={rows} />
      <Link
        href={`/c/${classroomId}/battle`}
        className="caps step press flex h-16 items-center justify-between bg-ink px-4 text-20 text-ground hover:bg-ink-2 sm:px-5"
      >
        <span className="flex items-center gap-3">
          <Swords size={22} strokeWidth={1.75} aria-hidden />
          Battle
        </span>
        <ChevronRight size={22} strokeWidth={2} aria-hidden />
      </Link>
    </section>
  );
}
