"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, LogOut, Repeat2, X } from "lucide-react";
import { Button, FormMessage } from "@/components/form";
import {
  REVEAL_MS,
  ROUND_MS,
  accuracy,
  formatLabel,
  roundTeamPoints,
  startCheck,
  teamCap,
  teamName,
  teamPlayers,
  topPlayer,
  type BattlePlayer,
  type BattleState,
} from "@/lib/battle";

// The four battle screens. One owns the phone at a time; each settles in once (.reveal) as it takes over.
// Pure views: battle-room.tsx holds the state, the clock and the server calls.

const LETTERS = "ABCDE";

export type Actions = {
  answer: (choice: number) => void;
  start: () => void;
  switchTeam: () => void;
  join: () => void;
  leave: () => void;
  next: () => void;
  again: () => void;
};

type Common = {
  s: BattleState;
  mine: BattlePlayer | null;
  host: boolean;
  busy: boolean;
  error: string | null;
  act: Actions;
  heading: RefObject<HTMLHeadingElement | null>;
};

// Lobby ----------------------------------------------------------------------------------------------------------

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
                    className="caps m-2 grid min-h-10 place-items-center border border-dashed border-rule-strong text-[14px] text-ink-2"
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

function LeaveButton({
  onClick,
  busy,
}: {
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="caps step inline-flex h-12 items-center gap-2 px-3 text-[17px] text-ink-2 hover:text-ink disabled:opacity-60"
    >
      <LogOut size={20} strokeWidth={1.75} aria-hidden />
      Leave
    </button>
  );
}

// Shared top: question number and the two team scores, your team marked. --------------------------------------------

function Scoreboard({
  s,
  mine,
}: {
  s: BattleState;
  mine: BattlePlayer | null;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] items-stretch border-b border-rule">
      <p className="caps num grid place-items-center border-r border-rule px-3 text-[16px] text-ink-2">
        <span>
          <span className="sr-only">Question </span>
          {s.round}/{s.total}
        </span>
      </p>
      {([1, 2] as const).map((team) => (
        <p
          key={team}
          className={`grid gap-0.5 border-r border-rule px-3 py-2 last:border-r-0 ${
            mine?.team === team ? "border-b-3 border-b-you" : ""
          }`}
        >
          <span className="caps text-[14px] text-ink-2">
            {teamName(team)}
            {mine?.team === team ? (
              <span className="sr-only">, your team</span>
            ) : null}
          </span>
          <span className="num font-display text-[30px] leading-none font-bold">
            {s.teams[team - 1]}
          </span>
        </p>
      ))}
    </div>
  );
}

// A bar that empties as time runs out: constant motion, so linear. It runs as a WAAPI transform animation
// (compositor, smooth while the page is busy, and untouched by the Calm rule, which only stops CSS animations).
// With Reduce Motion or Calm it steps once a second instead of gliding.
function Countdown({
  endsAt,
  totalMs,
  clock,
  now,
  label,
  warn = false,
}: {
  endsAt: number;
  totalMs: number;
  clock: () => number;
  now: number;
  label: (secondsLeft: number) => ReactNode;
  warn?: boolean;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const still =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motion === "calm";
    const left = Math.max(0, endsAt - clock());
    const timers: number[] = [];
    const mark = (ms: number) => {
      el.dataset.low = warn && ms <= 5000 ? "1" : "0";
    };
    mark(left);
    if (warn && left > 5000) timers.push(window.setTimeout(() => mark(0), left - 5000));
    if (still || typeof el.animate !== "function") {
      const step = () => {
        const ms = Math.max(0, endsAt - clock());
        el.style.transform = `scaleX(${Math.min(1, (Math.ceil(ms / 1000) * 1000) / totalMs)})`;
      };
      step();
      const t = window.setInterval(step, 250);
      return () => {
        window.clearInterval(t);
        timers.forEach(window.clearTimeout);
      };
    }
    el.style.transform = "";
    const run = el.animate(
      [{ transform: `scaleX(${Math.min(1, left / totalMs)})` }, { transform: "scaleX(0)" }],
      { duration: left, easing: "linear", fill: "forwards" },
    );
    return () => {
      run.cancel();
      timers.forEach(window.clearTimeout);
    };
  }, [endsAt, totalMs, clock, warn]);
  const secondsLeft = Math.ceil(Math.max(0, endsAt - now) / 1000);
  return (
    <div className="grid gap-1.5">
      <div className="h-2 bg-band" aria-hidden>
        <div
          ref={bar}
          className="h-full origin-left bg-ink data-[low=1]:bg-danger"
        />
      </div>
      <p className="caps num flex justify-end text-[15px] text-ink-2">
        {label(secondsLeft)}
      </p>
    </div>
  );
}

function Prompt({
  s,
  heading,
}: {
  s: BattleState;
  heading: Common["heading"];
}) {
  return (
    <h1
      ref={heading}
      tabIndex={-1}
      className="max-w-[65ch] text-[clamp(1.35rem,5vw,1.9rem)] leading-snug font-medium whitespace-pre-line outline-none"
    >
      {s.current?.prompt}
    </h1>
  );
}

// Who has answered this round: a square per player still here, solid once they're in, dashed while waiting.
function AnswerTicks({ s }: { s: BattleState }) {
  const live = s.players.filter((p) => p.active);
  return (
    <ul className="flex flex-wrap gap-1.5" aria-hidden>
      {live.map((p) => (
        <li
          key={p.user_id}
          className={`size-3.5 border ${
            p.in_round
              ? "border-ink bg-ink"
              : "border-dashed border-rule-strong"
          }`}
        />
      ))}
    </ul>
  );
}

// Question -------------------------------------------------------------------------------------------------------

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
  const live = s.players.filter((p) => p.active).length;
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

// Reveal ---------------------------------------------------------------------------------------------------------

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

// Results --------------------------------------------------------------------------------------------------------

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
