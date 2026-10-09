// Paste import for multiple-choice tests. Expected shape, forgiving about the details:
//   1. Question text (can wrap)
//   A. option   (also A)  (A)  a.)
//   ...up to E
//   Answer: B   (also Ans:, Correct answer:, Answer - B)
//   Explanation: optional, can wrap
// Every question comes back, even broken ones, with plain-language errors for the preview to show.

export type ParsedQuestion = {
  number: number;
  prompt: string;
  options: string[];
  correctIndex: number | null;
  explanation: string;
  errors: string[];
};

const QUESTION = /^\s*(\d{1,3})\s*[.)]\s+(.*)$/;
const OPTION = /^\s*\(?([A-Ea-e])[.)](?:\s+(.*))?$/;
const ANSWER = /^\s*(?:correct\s+)?(?:answer|ans)\s*[:\-–]?\s*\(?([A-Ea-e])\b/i;
const EXPLANATION = /^\s*(?:explanation|rationale|reason)\s*[:\-–]\s*(.*)$/i;
const LETTERS = "ABCDE";

type Draft = {
  number: number;
  prompt: string[];
  options: { letter: string; text: string }[];
  answer: string | null;
  explanation: string[];
  phase: "prompt" | "options" | "answered" | "explanation";
};

function finish(d: Draft): ParsedQuestion {
  const errors: string[] = [];
  const options = d.options.map((o) => o.text.trim());
  const prompt = d.prompt.join("\n").trim();
  if (!prompt) errors.push("Question text is empty.");
  if (prompt.length > 2000) errors.push("Question text is over 2000 characters.");
  if (options.some((o) => o.length > 500)) errors.push("An option is over 500 characters.");
  if (options.length < 2) errors.push("Needs at least 2 options.");
  if (options.some((o) => !o)) errors.push("An option is empty.");
  if (d.options.some((o, i) => o.letter !== LETTERS[i])) errors.push("Option letters are out of order.");

  let correctIndex: number | null = null;
  if (!d.answer) {
    errors.push("No answer. Pick the right option.");
  } else {
    const i = d.options.findIndex((o) => o.letter === d.answer);
    if (i === -1) errors.push(`Answer ${d.answer} isn't one of the options.`);
    else correctIndex = i;
  }

  return { number: d.number, prompt, options, correctIndex, explanation: d.explanation.join("\n").trim(), errors };
}

export function parseQuestions(text: string): { items: ParsedQuestion[]; ignored: number } {
  const items: ParsedQuestion[] = [];
  let ignored = 0;
  let d: Draft | null = null;

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    // A numbered line starts a question only if it's the first one or the next number,
    // so "2. Normal values" inside question text doesn't split it.
    const q = QUESTION.exec(line);
    if (q && (!d || Number(q[1]) === d.number + 1 || (d.phase !== "prompt" && d.phase !== "options"))) {
      if (d) items.push(finish(d));
      d = { number: Number(q[1]), prompt: [q[2].trim()], options: [], answer: null, explanation: [], phase: "prompt" };
      continue;
    }
    if (!d) {
      ignored++;
      continue;
    }

    const a = ANSWER.exec(line);
    if (a && (d.phase === "options" || d.phase === "prompt")) {
      d.answer = a[1].toUpperCase();
      d.phase = "answered";
      continue;
    }

    const e = EXPLANATION.exec(line);
    if (e && d.phase !== "prompt") {
      d.explanation.push(e[1].trim());
      d.phase = "explanation";
      continue;
    }

    if (d.phase === "explanation") {
      d.explanation.push(line.trim());
      continue;
    }

    const o = OPTION.exec(line);
    if (o && (d.phase === "prompt" || d.phase === "options")) {
      d.options.push({ letter: o[1].toUpperCase(), text: (o[2] ?? "").trim() });
      d.phase = "options";
      continue;
    }

    if (d.phase === "prompt") d.prompt.push(line.trim());
    else if (d.phase === "options") {
      const last = d.options[d.options.length - 1];
      last.text = `${last.text} ${line.trim()}`.trim();
    }
    // Stray lines after the answer (page numbers, footers) are dropped.
  }

  if (d) items.push(finish(d));
  return { items, ignored };
}
