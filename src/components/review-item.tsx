"use client";

import { Check, X } from "lucide-react";
import { AskTeacher, type FlagState } from "@/components/ask-teacher";
import { SelectionCards, type DeckOption } from "@/components/selection-cards";
import type { AttemptQuestion } from "@/lib/tests";

const LETTERS = "ABCDE";

// One question in a finished attempt. Takers get selection-to-flashcard and Ask teacher; trainers read it.
export function ReviewItem({
  q,
  mine,
  testId,
  decks,
  flag,
}: {
  q: AttemptQuestion;
  mine: boolean;
  testId: string;
  decks: DeckOption[];
  flag: FlagState | null;
}) {
  // Null verdict: the trainer has answers off, so the taker only sees that they answered.
  const verdict =
    q.selected_index === null
      ? "Blank"
      : q.is_correct === null
        ? "Answered"
        : q.is_correct
          ? "Right"
          : "Wrong";
  const rightText =
    q.correct_index !== null ? (q.options[q.correct_index] ?? null) : null;

  return (
    <li className="grid gap-3 border-b border-rule py-5">
      <div className="flex items-start gap-3">
        <span className="num w-8 shrink-0 font-display text-[22px] leading-tight font-semibold text-ink-2">
          {q.pos}
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <p
            className={`caps text-[14px] ${verdict === "Right" ? "text-ok" : verdict === "Wrong" ? "text-danger" : "text-ink-2"}`}
          >
            {verdict}
          </p>
          <SelectionCards decks={decks} answer={rightText} enabled={mine}>
            <p className="text-[17px] whitespace-pre-line">{q.prompt}</p>
          </SelectionCards>
        </div>
      </div>
      <ul className="grid gap-1 pl-11">
        {q.choice_order.map((original, shown) => {
          const right = q.correct_index === original;
          const picked = q.selected_index === original;
          return (
            <li
              key={original}
              className={`flex items-start gap-2 px-2 py-1 text-[16px] ${
                right
                  ? "bg-ok/15 font-medium"
                  : picked
                    ? "bg-danger/10"
                    : "text-ink-2"
              }`}
            >
              <span className="num w-5 shrink-0 font-semibold">
                {LETTERS[shown]}
              </span>
              <span className="min-w-0 flex-1">{q.options[original]}</span>
              {right ? (
                <Check
                  size={18}
                  strokeWidth={2.25}
                  className="mt-0.5 shrink-0 text-ok"
                  aria-label="Right answer"
                />
              ) : null}
              {picked && !right ? (
                <X
                  size={18}
                  strokeWidth={2.25}
                  className="mt-0.5 shrink-0 text-danger"
                  aria-label={mine ? "Your answer" : "Their answer"}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {q.explanation ? (
        <p className="pl-11 text-[15px] text-ink-2">{q.explanation}</p>
      ) : null}
      {mine && q.selected_index !== null ? (
        <div className="pl-11">
          <AskTeacher testId={testId} questionId={q.question_id} flag={flag} />
        </div>
      ) : null}
    </li>
  );
}
