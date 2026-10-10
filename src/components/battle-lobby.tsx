"use client";

import { ArrowLeftRight } from "lucide-react";
import { Button, FormMessage } from "@/components/form";
import { LeaveButton, type Common } from "@/components/battle-parts";
import {
  formatLabel,
  startCheck,
  teamCap,
  teamName,
  teamPlayers,
} from "@/lib/battle";

// The lobby: the code big enough to read across a room, the two teams, and Start for the host.

export function Lobby({ s, mine, host, busy, error, act, heading }: Common) {
  const cap = teamCap(s.format);
  const check = startCheck(s);
  const fixed = s.format !== "teams";
  const source = s.source_title ?? "All questions";
  const inGame = Boolean(mine?.active);
  return (
    <div className="reveal grid gap-8">
      <section
        aria-labelledby="battle-code-h"
        className="-mx-4 grid gap-2 bg-field px-4 py-7 text-on-field sm:mx-0 sm:px-8"
      >
        <h1
          id="battle-code-h"
          ref={heading}
          tabIndex={-1}
          className="caps text-[16px] text-on-field-2 outline-none"
        >
          Battle code
        </h1>
        <p className="num font-display text-[clamp(4.5rem,26vw,8.5rem)] leading-[0.85] font-bold tracking-[0.08em]">
          {s.code}
        </p>
        <p className="caps num text-[16px] text-on-field-2">
          {formatLabel(s.format)} · {s.total} questions · {source}
        </p>
      </section>

      <div className="grid grid-cols-2 border-y border-rule">
        {([1, 2] as const).map((team) => {
          const rows = teamPlayers(s, team).filter((p) => p.active);
          const open = fixed ? Math.max(0, cap - rows.length) : 0;
          return (
            <section
              key={team}
              aria-label={teamName(team)}
              className="grid content-start border-r border-rule last:border-r-0"
            >
              <h2 className="caps num flex items-baseline justify-between gap-2 border-b border-rule px-3 py-3 text-[17px]">
                {teamName(team)}
                <span className="text-[15px] text-ink-2">
                  {rows.length}
                  {fixed ? `/${cap}` : ""}
                </span>
              </h2>
              <ul>
                {rows.map((p) => (
                  <li
                    key={p.user_id}
                    className={`min-h-12 border-b border-rule px-3 py-3 text-[17px] [overflow-wrap:anywhere] last:border-b-0 ${
                      p.user_id === s.me ? "bg-you text-on-you" : ""
                    }`}
                  >
                    {p.name}
                    {p.user_id === s.host_id ? (
                      <span className="caps ml-2 text-[14px] opacity-80">
                        Host
                      </span>
                    ) : null}
                  </li>
                ))}
                {Array.from({ length: open }, (_, i) => (
                  <li
                    key={`open-${i}`}
                    className="caps m-2 grid min-h-10 place-items-center border border-rule-strong text-[14px] text-ink-2"
                  >
                    Open
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="grid gap-3">
        {host && inGame ? (
          <>
            <Button
              type="button"
              onClick={act.start}
              disabled={busy || !check.ok}
              className="h-16 w-full text-[20px]"
            >
              {busy ? "Starting" : "Start"}
            </Button>
            {!check.ok ? (
              <p className="text-[16px] text-ink-2">{check.reason}</p>
            ) : null}
          </>
        ) : inGame ? (
          <p className="caps text-[17px] text-ink-2" aria-live="polite">
            Waiting for the host
          </p>
        ) : (
          <Button
            type="button"
            variant="you"
            onClick={act.join}
            disabled={busy}
            className="h-16 w-full text-[20px]"
          >
            {busy ? "Joining" : "Join"}
          </Button>
        )}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        {inGame ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="line"
              onClick={act.switchTeam}
              disabled={busy}
            >
              <ArrowLeftRight size={20} strokeWidth={1.75} aria-hidden />
              Switch team
            </Button>
            <LeaveButton onClick={act.leave} busy={busy} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
