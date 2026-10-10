"use client";

import { Check, X } from "lucide-react";
import { Button, FormMessage } from "@/components/form";
import {
  Countdown,
  LETTERS,
  Prompt,
  Scoreboard,
  type Common,
} from "@/components/battle-parts";
import { REVEAL_MS, roundTeamPoints, teamName } from "@/lib/battle";

// After a round closes: the right answer, your verdict and points, for 5 s (the host can go on sooner).

export function Reveal({
  s,
  mine,
  host,
  busy,
  error,
  act,
  heading,
  clock,
  now,
}: Common & { clock: () => number; now: number }) {
  const cur = s.current!;
  const mineResult = cur.results?.find((r) => r.user_id === s.me) ?? null;
  const [a, b] = roundTeamPoints(s);
  const last = s.round >= s.total;
  const gained = mineResult?.points ?? 0;
  const verdict = !mine
    ? null
    : !mineResult
      ? "No answer"
      : mineResult.is_correct
        ? "Right"
        : "Not quite";
  return (
    <div key={`r-${cur.no}`} className="reveal grid gap-5">
      <Scoreboard s={s} mine={mine} />
      <Prompt s={s} heading={heading} />
      <ul className="grid max-w-2xl gap-2">
        {cur.options.map((text, i) => {
          const right = cur.correct_index === i;
          const wrong = !right && cur.my_choice === i;
          return (
            <li key={i}>
              <div
                className={`step flex min-h-16 w-full items-center gap-4 border px-4 py-3 text-[18px] ${
                  right
                    ? "border-ok bg-ok/15"
                    : wrong
                      ? "border-danger bg-danger/10"
                      : "border-rule text-ink-2"
                }`}
              >
                <span className="num w-6 shrink-0 font-display text-[22px] font-bold">
                  {LETTERS[i]}
                </span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {text}
                </span>
                {right ? (
                  <Check
                    size={24}
                    strokeWidth={2.25}
                    className="shrink-0 text-ok"
                    aria-label="Right answer"
                  />
                ) : null}
                {wrong ? (
                  <X
                    size={24}
                    strokeWidth={2.25}
                    className="shrink-0 text-danger"
                    aria-label="Your answer"
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div
        className="grid grid-cols-[1fr_auto] items-end gap-4 border-y border-rule py-4"
        aria-live="polite"
      >
        <div className="grid gap-1">
          {verdict ? (
            <p
              className={`caps text-[18px] ${mineResult?.is_correct ? "text-ok" : "text-ink-2"}`}
            >
              {verdict}
            </p>
          ) : null}
          <p className="caps num text-[16px] text-ink-2">
            {teamName(1)} +{a} · {teamName(2)} +{b}
          </p>
        </div>
        {mine ? (
          <p
            className={`num font-display text-[clamp(3rem,16vw,4.5rem)] leading-none font-bold ${
              gained > 0 ? "text-ok" : "text-ink-2"
            }`}
          >
            +{gained}
          </p>
        ) : null}
      </div>
      {host ? (
        <Button
          type="button"
          onClick={act.next}
          disabled={busy}
          className="h-14 w-full text-[19px]"
        >
          {last ? "Results" : "Next"}
        </Button>
      ) : null}
      <Countdown
        endsAt={Date.parse(cur.closed_at ?? s.now) + REVEAL_MS}
        totalMs={REVEAL_MS}
        clock={clock}
        now={now}
        label={(n) => (
          <span>
            {last ? "Results" : "Next"} in {n}
          </span>
        )}
      />
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}
