"use client";

import Link from "next/link";
import { Repeat2 } from "lucide-react";
import { Button, FormMessage } from "@/components/form";
import type { Common } from "@/components/battle-parts";
import { accuracy, teamName, teamPlayers, topPlayer } from "@/lib/battle";

// The end: who won, both totals, the top player, your line, and Play again.

export function Results({ s, mine, busy, error, act, heading }: Common) {
  const top = topPlayer(s.players);
  const won = mine && s.winner === mine.team;
  // 1v1 names the person; team formats name the team.
  const solo =
    s.winner !== null && s.format === "1v1"
      ? teamPlayers(s, s.winner)[0]
      : null;
  const headline =
    s.winner === null
      ? "Tie"
      : won && s.format === "1v1"
        ? "You win"
        : `${solo?.name ?? teamName(s.winner)} wins`;
  return (
    <div className="reveal grid gap-8">
      <section
        aria-labelledby="results-h"
        className="-mx-4 grid gap-5 bg-field px-4 py-7 text-on-field sm:mx-0 sm:px-8"
      >
        <h1
          id="results-h"
          ref={heading}
          tabIndex={-1}
          className="font-display text-[clamp(3rem,15vw,6rem)] leading-[0.9] font-bold uppercase outline-none"
        >
          {headline}
        </h1>
        <dl className="grid grid-cols-2 border-t border-on-field-2/40">
          {([1, 2] as const).map((team) => (
            <div
              key={team}
              className="grid gap-1 border-r border-on-field-2/40 pt-3 pr-3 last:border-r-0 last:pl-3"
            >
              <dt className="caps text-[15px] text-on-field-2">
                {teamName(team)}
                {mine?.team === team ? " · You" : ""}
              </dt>
              <dd className="num font-display text-[clamp(2.75rem,13vw,4.5rem)] leading-none font-bold">
                {s.teams[team - 1]}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3 border-y border-rule px-1 py-4 text-[17px] sm:px-3">
        {top ? (
          <>
            <dt className="caps text-ink-2">Top player</dt>
            <dd className="num flex flex-wrap justify-between gap-x-3 [overflow-wrap:anywhere]">
              <span>{top.name}</span>
              <span className="font-semibold">{top.points}</span>
            </dd>
          </>
        ) : null}
        {mine ? (
          <>
            <dt className="caps text-ink-2">You</dt>
            <dd className="num flex flex-wrap justify-between gap-x-3">
              <span>
                {mine.correct}/{s.total} right ·{" "}
                {accuracy(mine.correct, s.total)}%
              </span>
              <span className="font-semibold">{mine.points}</span>
            </dd>
          </>
        ) : null}
      </dl>

      <div className="grid gap-3">
        {mine ? (
          <Button
            type="button"
            onClick={act.again}
            disabled={busy}
            className="h-16 w-full text-[20px]"
          >
            <Repeat2 size={22} strokeWidth={1.75} aria-hidden />
            {s.rematch_id ? "Join the rematch" : "Play again"}
          </Button>
        ) : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <Link
          href={`/c/${s.classroom_id}`}
          className="caps step inline-flex h-12 items-center justify-center border border-ink px-6 text-[17px] hover:bg-band"
        >
          Back to {s.classroom_name ?? "the event"}
        </Link>
      </div>
    </div>
  );
}
