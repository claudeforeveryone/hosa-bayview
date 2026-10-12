import type { ComponentProps, ReactNode } from "react";
import { Check, X } from "lucide-react";
import { KeyHint } from "@/components/key-hint";

// The question view's pieces, shared by a test attempt (take-test) and the career quiz: one answer card per
// option and the boxed verdict under them. Purely visual; the caller decides what each card's state is.
// Styles live in the "Question view" block of globals.css (.choice, .q-prompt), driven by data-state.

export const LETTERS = "ABCDE";

// idle: open to pick. chosen: your pick, no verdict yet (or a timed test). right / wrong: the verdict, on the
// key and on a wrong pick. dim: every other option once the question is settled.
export type ChoiceState = "idle" | "chosen" | "right" | "wrong" | "dim";

export function choiceState({
  chosen,
  right,
  wrong,
  settled,
}: {
  chosen: boolean;
  right: boolean;
  wrong: boolean;
  settled: boolean;
}): ChoiceState {
  if (right) return "right";
  if (wrong) return "wrong";
  if (chosen) return "chosen";
  return settled ? "dim" : "idle";
}

export function AnswerChoice({
  letter,
  state,
  picked,
  fresh = false,
  hint,
  children,
  className = "",
  ...button
}: {
  letter: string;
  state: ChoiceState;
  // This card is the member's own pick (only a pick gets the verdict's pop or shake).
  picked: boolean;
  // The verdict just came back (not one you went back to), so it may move.
  fresh?: boolean;
  // The number key that picks it, shown only where there's a keyboard (KeyHint).
  hint?: number;
  children: ReactNode;
} & Omit<ComponentProps<"button">, "children">) {
  const motion = !fresh
    ? ""
    : state === "right" && picked
      ? "choice-pop"
      : state === "wrong"
        ? "choice-shake"
        : "";
  return (
    <button
      type="button"
      data-state={state}
      className={`choice ${motion} ${className}`}
      {...button}
    >
      <span className="choice-tile num">{letter}</span>
      <span className="choice-text">{children}</span>
      {hint !== undefined || state === "right" || state === "wrong" ? (
        <span className="choice-end">
          {hint !== undefined ? <KeyHint n={hint} /> : null}
          {state === "right" ? (
            <Check
              size={24}
              strokeWidth={2.5}
              className={`shrink-0 ${fresh ? "verdict-pop" : ""}`}
              aria-label="Right answer"
            />
          ) : null}
          {state === "wrong" ? (
            <X
              size={24}
              strokeWidth={2.5}
              className={`shrink-0 ${fresh ? "verdict-pop" : ""}`}
              aria-label="Your answer, wrong"
            />
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

const TONES = {
  ok: { box: "border-ok", head: "bg-ok text-ground", Icon: Check },
  danger: { box: "border-danger", head: "bg-danger text-ground", Icon: X },
  wait: { box: "border-rule-strong", head: "bg-band text-ink-2", Icon: null },
} as const;

// The verdict under the options: a solid head band in the verdict's colour, then the explanation boxed by a
// 3px rule of the same colour. `animate` lets a fresh verdict settle in (.reveal; a fade under Reduce Motion).
export function VerdictPanel({
  tone,
  label,
  animate = false,
  children,
}: {
  tone: keyof typeof TONES;
  label: string;
  animate?: boolean;
  children?: ReactNode;
}) {
  const { box, head, Icon } = TONES[tone];
  return (
    <div className={`border-[3px] ${box} ${animate ? "reveal" : ""}`}>
      <p
        className={`caps flex min-h-11 items-center gap-2 px-4 py-2 text-18 ${head}`}
      >
        {Icon ? <Icon size={20} strokeWidth={2.5} aria-hidden /> : null}
        {label}
      </p>
      {children ? (
        <div className="grid gap-2 px-4 py-3 text-17 leading-relaxed">
          {children}
        </div>
      ) : null}
    </div>
  );
}
