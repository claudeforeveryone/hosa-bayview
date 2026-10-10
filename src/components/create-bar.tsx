"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { FormMessage } from "@/components/form";
import type { ClassroomOption } from "@/components/new-blank";
import { useDisclosureClose } from "@/hooks/use-disclosure-close";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

// One slim strip, three cells: it reads as a single control, not three cards.
const tile =
  "caps step flex h-14 w-full min-w-0 items-center justify-center gap-2 px-2 text-[16px] hover:bg-band aria-disabled:opacity-60 sm:text-[17px]";

// The tile's face. Screen readers hear "New test" at rest and "Making" while it works.
function Face({
  text,
  pending,
  menu,
}: {
  text: string;
  pending?: boolean;
  menu?: boolean;
}) {
  return (
    <>
      <Plus size={18} strokeWidth={2.25} aria-hidden className="shrink-0" />
      <span className="truncate">
        {pending ? (
          "Making"
        ) : (
          <>
            <span className="sr-only sm:not-sr-only">New </span>
            {text}
          </>
        )}
      </span>
      {menu ? (
        <ChevronDown
          size={16}
          strokeWidth={2}
          aria-hidden
          className="shrink-0 text-ink-2 group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
        />
      ) : null}
    </>
  );
}

// New test: one tap with one classroom, a pick of classroom with several, and the way to a classroom with none.
function TestTile({
  rooms,
  run,
  pending,
  busy,
  onStart,
}: {
  rooms: ClassroomOption[];
  run: (form: FormData) => void;
  pending: boolean;
  busy: boolean;
  onStart: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useDisclosureClose(menu);

  if (!rooms.length)
    return (
      <Link
        href="/c/new"
        className={tile}
        aria-label="New test: make a classroom first"
      >
        <Face text="Test" />
      </Link>
    );

  if (rooms.length === 1)
    return (
      <form action={run} onSubmit={onStart}>
        <input type="hidden" name="classroom_id" value={rooms[0].id} />
        <button
          type="submit"
          aria-disabled={busy || undefined}
          aria-busy={pending || undefined}
          className={tile}
        >
          <Face text="Test" pending={pending} />
        </button>
      </form>
    );

  return (
    <details ref={menu} className="board-menu group relative">
      <summary
        aria-busy={pending || undefined}
        className={`${tile} cursor-pointer list-none select-none group-open:bg-band [&::-webkit-details-marker]:hidden`}
      >
        <Face text="Test" pending={pending} menu />
      </summary>
      <form
        action={run}
        onSubmit={(e) => {
          onStart(e);
          const el = menu.current;
          if (!el || e.defaultPrevented) return;
          // Close and hand focus back to the toggle, so keyboard users keep their place.
          el.open = false;
          el.querySelector("summary")?.focus();
        }}
        className="board-menu-panel absolute top-full left-0 z-20 mt-1 grid max-h-72 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto border border-ink bg-ground py-1.5"
      >
        <p className="caps px-4 pt-1 pb-2 text-[13px] text-ink-2">
          Which classroom
        </p>
        {rooms.map((r) => (
          <button
            key={r.id}
            type="submit"
            name="classroom_id"
            value={r.id}
            aria-disabled={busy || undefined}
            className="flex min-h-11 items-center px-4 text-left text-[16px] font-medium transition-colors duration-100 hover:bg-band focus-visible:-outline-offset-2"
          >
            <span className="truncate">{r.name}</span>
          </button>
        ))}
      </form>
    </details>
  );
}

// Home, for trainers and executives: a test, a deck or a classroom, one tap each.
export function CreateBar({
  rooms,
  newTest,
  newDeck,
}: {
  rooms: ClassroomOption[];
  newTest: Action;
  newDeck: Action;
}) {
  const [testState, runTest, testPending] = useActionState<FormState, FormData>(
    newTest,
    {},
  );
  const [deckState, runDeck, deckPending] = useActionState<FormState, FormData>(
    newDeck,
    {},
  );
  // One create at a time: a second tap while one runs would leave an extra untitled draft. Buttons stay
  // focusable (aria-disabled) so focus isn't dropped while it works.
  const busy = testPending || deckPending;
  // Only the tile tapped last speaks, and only once its answer is in.
  const [last, setLast] = useState<"test" | "deck" | null>(null);
  const start = (which: "test" | "deck") => (e: FormEvent<HTMLFormElement>) => {
    if (busy) e.preventDefault();
    else setLast(which);
  };
  const error = busy
    ? null
    : last === "test"
      ? testState.error
      : last === "deck"
        ? deckState.error
        : null;

  return (
    <section aria-label="Create" className="grid gap-3">
      <div className="grid grid-cols-3 divide-x divide-ink border border-ink">
        <TestTile
          rooms={rooms}
          run={runTest}
          pending={testPending}
          busy={busy}
          onStart={start("test")}
        />
        <form action={runDeck} onSubmit={start("deck")}>
          <button
            type="submit"
            aria-disabled={busy || undefined}
            aria-busy={deckPending || undefined}
            className={tile}
          >
            <Face text="Deck" pending={deckPending} />
          </button>
        </form>
        <Link href="/c/new" className={tile}>
          <Face text="Class" />
        </Link>
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </section>
  );
}
