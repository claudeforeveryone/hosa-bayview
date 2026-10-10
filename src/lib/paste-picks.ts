// A trainer's taps in the paste preview: which option is right for a question. Picks are keyed by the
// question's own text, so typing elsewhere in the box keeps them, and editing that question drops its pick.

import {
  isAnswerError,
  sourceWithAnswer,
  type ParsedQuestion,
} from "@/lib/parse/questions";

export type Picks = Record<string, number>;

export function pickKey(q: ParsedQuestion): string {
  return `${q.number}\n${q.source}`;
}

// A pick states the answer, so it settles missing, wrong-letter and disagreeing answers, and nothing else.
export function withPick(q: ParsedQuestion, pick: number | undefined) {
  if (pick === undefined) return { correct: q.correctIndex, errors: q.errors };
  return { correct: pick, errors: q.errors.filter((e) => !isAnswerError(e)) };
}

// The text that goes back in the box for the questions in `keep` (by index), each with its pick written in as
// "Answer: X" so a correction is never lost.
export function leftoverText(
  items: ParsedQuestion[],
  keep: Set<number>,
  picks: Picks,
): string {
  return items
    .map((q, i) => ({ q, i }))
    .filter(({ i }) => keep.has(i))
    .map(({ q }) => {
      const pick = picks[pickKey(q)];
      const letter = pick === undefined ? undefined : q.letters[pick];
      return letter ? sourceWithAnswer(q.source, letter) : q.source;
    })
    .join("\n\n");
}
