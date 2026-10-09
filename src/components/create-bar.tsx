"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { FormState } from "@/app/(app)/c/actions";
import { FormMessage } from "@/components/form";
import type { ClassroomOption } from "@/components/new-blank";
import { useDisclosureClose } from "@/hooks/use-disclosure-close";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

const tile =
  "step grid h-28 w-full min-w-0 content-between justify-items-start overflow-hidden border border-ink p-3 text-left hover:bg-band aria-disabled:opacity-60 sm:h-32 sm:p-4";
const word =
  "font-display text-[clamp(1.375rem,7vw,2.75rem)] leading-none font-bold uppercase";

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
      <span className="flex w-full items-center justify-between">
        <Plus size={26} strokeWidth={2} aria-hidden />
        {menu ? (
          <ChevronDown
            size={20}
            strokeWidth={2}
            aria-hidden
            className="text-ink-2 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-180"
          />
        ) : null}
      </span>
      <span className={word}>
        {pending ? (
          "Making"
        ) : (
          <>
            <span className="sr-only">New </span>
            {text}
          </>
        )}
      </span>
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
    <section aria-labelledby="create-h" className="grid gap-3">
      <h2 id="create-h" className="caps px-1 text-[17px] text-ink-2 sm:px-3">
        Create
      </h2>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
