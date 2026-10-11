"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { LogOut } from "lucide-react";
import { teamName, type BattlePlayer, type BattleState } from "@/lib/battle";
import { prefersCalm } from "@/lib/motion";

// Pieces shared by the battle screens (battle-lobby, -question, -reveal, -results, -ended). Pure views:
// battle-room.tsx holds the state, the clock and the server calls.

export const LETTERS = "ABCDE";

export type Actions = {
  answer: (choice: number) => void;
  start: () => void;
  switchTeam: () => void;
  join: () => void;
  leave: () => void;
  next: () => void;
  again: () => void;
};

export type Common = {
  s: BattleState;
  mine: BattlePlayer | null;
  host: boolean;
  busy: boolean;
  error: string | null;
  act: Actions;
  heading: RefObject<HTMLHeadingElement | null>;
};

// Players a round waits for: still in the battle and heard from in the last 15 s.
export const waitingOn = (s: BattleState) =>
  s.players.filter((p) => p.active && p.seen);

export function LeaveButton({
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
      className="caps step inline-flex h-12 items-center gap-2 px-3 text-17 text-ink-2 hover:text-ink disabled:opacity-60"
    >
      <LogOut size={20} strokeWidth={1.75} aria-hidden />
      Leave
    </button>
  );
}

// Shared top: question number and the two team scores, your team marked. --------------------------------------------

export function Scoreboard({
  s,
  mine,
}: {
  s: BattleState;
  mine: BattlePlayer | null;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] items-stretch border-b border-rule">
      <p className="caps num grid place-items-center border-r border-rule px-3 text-16 text-ink-2">
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
          <span className="caps text-14 text-ink-2">
            {teamName(team)}
            {mine?.team === team ? (
              <span className="sr-only">, your team</span>
            ) : null}
          </span>
          <span className="num font-display text-30 leading-none font-bold">
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
export function Countdown({
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
    const still = prefersCalm();
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
      <p className="caps num flex justify-end text-15 text-ink-2">
        {label(secondsLeft)}
      </p>
    </div>
  );
}

export function Prompt({
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

// Who has answered this round: a square per player still here (away players drop out), solid once they're in, dashed while waiting.
export function AnswerTicks({ s }: { s: BattleState }) {
  const live = waitingOn(s);
  return (
    <ul className="flex flex-wrap gap-1.5" aria-hidden>
      {live.map((p) => (
        <li
          key={p.user_id}
          className={`size-3.5 border ${
            p.in_round
              ? "border-ink bg-ink"
              : "border-rule-strong"
          }`}
        />
      ))}
    </ul>
  );
}
