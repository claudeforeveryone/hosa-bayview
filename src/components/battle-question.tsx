"use client";

import { Button, FormMessage } from "@/components/form";
import {
  AnswerTicks,
  Countdown,
  LETTERS,
  Prompt,
  Scoreboard,
  waitingOn,
  type Common,
} from "@/components/battle-parts";
import { ROUND_MS } from "@/lib/battle";

// A round in play: 20 s, the prompt, big options, and who has answered.

export function Question({
  s,
  mine,
  busy,
  error,
  act,
  heading,
  choice,
  clock,
  now,
  timeUp,
}: Common & {
  choice: number | null;
  clock: () => number;
  now: number;
  timeUp: boolean;
}) {
  const cur = s.current!;
  const playing = Boolean(mine?.active);
  const locked = choice !== null || timeUp || !playing;
  const live = waitingOn(s).length;
  const status = !playing
    ? mine
      ? "You left this battle"
      : "Watching"
    : choice !== null
      ? `Locked in · ${cur.answered} of ${live} answered`
      : timeUp
        ? "Time"
        : "Pick one";
  return (
    <div key={`q-${cur.no}`} className="reveal grid gap-5">
      <Scoreboard s={s} mine={mine} />
      <Countdown
        endsAt={Date.parse(cur.ends_at ?? s.now)}
        totalMs={ROUND_MS}
        clock={clock}
        now={now}
        warn
        label={(n) => <span aria-hidden>{n}</span>}
      />
      <Prompt s={s} heading={heading} />
      <ul className="grid max-w-2xl gap-2">
        {cur.options.map((text, i) => {
          const chosen = choice === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => act.answer(i)}
                disabled={locked || busy}
                aria-pressed={chosen}
                className={`step flex min-h-16 w-full items-center gap-4 border px-4 py-3 text-left text-[18px] disabled:cursor-default ${
                  chosen
                    ? "border-ink bg-ink text-ground"
                    : locked
                      ? "border-rule text-ink-2"
                      : "border-rule-strong hover:border-ink hover:bg-band"
                }`}
              >
                <span className="num w-6 shrink-0 font-display text-[22px] font-bold">
                  {LETTERS[i]}
                </span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="caps num text-[17px] text-ink-2" aria-live="polite">
          {status}
        </p>
        <AnswerTicks s={s} />
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {mine && !mine.active ? (
        <Button
          type="button"
          variant="you"
          onClick={act.join}
          disabled={busy}
          className="w-full"
        >
          Rejoin
        </Button>
      ) : null}
    </div>
  );
}
