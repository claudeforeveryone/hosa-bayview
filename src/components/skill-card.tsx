"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type Step, totalPoints } from "@/lib/parse/steps";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// One skill as a rating sheet: ordered steps you tick off while you run it. Ticks live in this tab only and
// clear on reload. A ticked step is struck through: in this system struck means done.
export function SkillCard({
  name,
  round,
  steps,
  note,
  defaultOpen = false,
  children,
}: {
  name: string;
  round: string | null;
  steps: Step[];
  note: string | null;
  defaultOpen?: boolean;
  children?: ReactNode; // manager controls
}) {
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());
  const total = totalPoints(steps);
  const earned = steps.reduce(
    (sum, s, i) => (done.has(i) ? sum + (s.points ?? 0) : sum),
    0,
  );
  const meta = [
    round,
    steps.length ? plural(steps.length, "step") : null,
    total === null ? null : plural(total, "point"),
  ]
    .filter(Boolean)
    .join(" · ");

  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <details open={defaultOpen} className="group border-b border-rule">
      <summary className="step grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3">
        <span className="grid min-w-0 gap-1">
          <span className="font-display text-[clamp(1.5rem,5vw,2.25rem)] leading-[1.05] font-semibold [overflow-wrap:anywhere] uppercase">
            {name}
          </span>
          {meta ? <span className="text-[16px] text-ink-2">{meta}</span> : null}
        </span>
        <span className="flex items-center gap-3 text-ink-2">
          {done.size ? (
            <span className="num font-display text-[22px] font-semibold text-ink">
              {done.size}/{steps.length}
            </span>
          ) : null}
          <ChevronDown
            size={22}
            strokeWidth={1.75}
            aria-hidden
            className="group-open:rotate-180"
          />
        </span>
      </summary>

      <div className="grid gap-5 px-1 pb-8 sm:px-3">
        {steps.length ? (
          <ol className="border-t border-rule">
            {steps.map((s, i) => {
              const checked = done.has(i);
              return (
                <li key={i} className="border-b border-rule">
                  <label className="step grid min-h-12 cursor-pointer grid-cols-[1.25rem_1.75rem_minmax(0,1fr)_auto] items-start gap-x-3 py-3 hover:bg-band">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(i)}
                      className="mt-1 size-5 shrink-0 accent-[var(--ink)]"
                    />
                    <span
                      className="num pt-0.5 text-[15px] text-ink-2"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span
                      className={`text-[17px] [overflow-wrap:anywhere] ${checked ? "text-ink-2 line-through decoration-1" : ""}`}
                    >
                      {s.text}
                    </span>
                    {s.points === undefined ? (
                      <span />
                    ) : (
                      <span className="num pt-0.5 text-[15px] whitespace-nowrap text-ink-2">
                        {s.points} pt{s.points === 1 ? "" : "s"}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ol>
        ) : null}

        {note ? (
          <p className="max-w-[65ch] text-[16px] whitespace-pre-line text-ink-2">
            {note}
          </p>
        ) : null}

        {steps.length ? (
          <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2">
            <p className="num text-[16px]">
              {done.size}/{steps.length} done
              {total === null ? null : ` · ${earned}/${total} points`}
            </p>
            {done.size ? (
              <button
                type="button"
                onClick={() => setDone(new Set())}
                className="caps step inline-flex h-11 items-center border border-ink px-4 text-[16px] hover:bg-band"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>
    </details>
  );
}
