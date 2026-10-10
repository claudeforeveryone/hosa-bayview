// Paste import for multiple-choice tests. Expected shape, forgiving about the details:
//   1. Question text (can wrap)     also 1)  1:  Q1.  Question 1
//   A. option   (also A)  (A)  a.)  several on one line work too
//   ...up to E
//   Answer: B   (also Ans. B, Correct answer is B, Answer - B)
//   Explanation: optional, can wrap
// or no answer lines and an answer key at the end ("Answer key" then "1. B", "2) C" or "1-B, 2-C").
// Every question comes back, even broken ones, with plain-language errors for the preview to show.
// Lines that belong to no question come back in `skipped`, each with the reason.

export type ParsedQuestion = {
  number: number;
  // 1-based line in the pasted text where the question starts.
  line: number;
  // The question's own lines, so a question that isn't added can go back in the paste box as typed.
  source: string;
  // Each option's letter as typed (they can be out of order, which is an error).
  letters: string[];
  prompt: string;
  options: string[];
  correctIndex: number | null;
  explanation: string;
  errors: string[];
};

export type SkippedLine = { line: number; text: string; reason: string };

// A question starts with a number and a delimiter ("12." "12)" "12:"), "Q12." / "Q12)", or "Question 12". Clinical
// shorthand like q4h, q12h and q.i.d. has no delimiter after the number, so it never starts a question.
const NUMBERED = /^\s*(\d{1,3})\s*[.):](?!\d)\s*(.*)$/;
const LABELLED =
  /^\s*(?:q\s?(\d{1,3})\s*[.):]|question\s+(\d{1,3})\b\s*[.):\-–]?)\s*(.*)$/i;
const OPTION = /^\s*\(?([A-Ea-e])[.)](?:\s+(.*))?$/;
// Only an explicit key form counts: "Answer: B", "Ans. B", "Answer - B", "Answer: (B)", "Correct answer is B".
// The letter has to stand alone, so a wrapped option ("answer a short questionnaire") is never read as the key.
const ANSWER =
  /^\s*(?:correct\s+answer|answer|ans)\s*(?:is\s+|[:.\-–]\s*)\(?([A-Ea-e])\)?(?=$|[\s.)])/i;
const EXPLANATION = /^\s*(?:explanation|rationale|reason)\s*[:\-–]\s*(.*)$/i;
const KEY_HEADING =
  /^\s*(?:answer\s*key|answer\s*sheet|answers|key)\s*[:\-–]?\s*(.*)$/i;
const KEY_ENTRY = /(\d{1,3})\s*[.):\-–]?\s*\(?([A-Ea-e])\)?(?![A-Za-z0-9])/g;
// PDF footers: "Page 2 of 9", "12", "- 3 -", "4/10".
const PAGE_NUMBER =
  /^\s*-?\s*(?:page\s*)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?\s*-?\s*$/i;
const LETTERS = "ABCDE";

type Draft = {
  number: number;
  line: number;
  raw: string[];
  prompt: string[];
  options: { letter: string; text: string }[];
  answer: string | null;
  keyed: boolean;
  // Set when a second answer line or the answer key disagrees: the trainer has to pick.
  conflict: string | null;
  explanation: string[];
  phase: "prompt" | "options" | "answered" | "explanation" | "closed";
};

// "1. B  2) C, 3-D" -> [[1, "B"], ...], or null when the line is anything other than key entries.
function keyEntries(
  text: string,
): { number: number; letter: string; text: string }[] | null {
  const entries = [...text.matchAll(KEY_ENTRY)];
  if (
    !entries.length ||
    text.replace(KEY_ENTRY, "").replace(/[\s,;|]/g, "") !== ""
  )
    return null;
  return entries.map((m) => ({
    number: Number(m[1]),
    letter: m[2].toUpperCase(),
    text: m[0].trim(),
  }));
}

function questionStart(line: string): { number: number; rest: string } | null {
  const n = NUMBERED.exec(line);
  if (n) return { number: Number(n[1]), rest: n[2].trim() };
  const l = LABELLED.exec(line);
  return l ? { number: Number(l[1] ?? l[2]), rest: l[3].trim() } : null;
}

// Errors a trainer's pick in the preview settles: it states the answer outright.
export function isAnswerError(e: string): boolean {
  return (
    e.startsWith("No answer") ||
    e.startsWith("Answer ") ||
    e.startsWith("Two answer lines")
  );
}

// The question's own text with its answer set to `letter`: any answer lines dropped, then "Answer: X" placed
// before the explanation (after it, the line would read as more explanation). Used when a question goes back into
// the paste box, so a trainer's pick survives.
export function sourceWithAnswer(source: string, letter: string): string {
  const lines = source.split("\n").filter((l) => !ANSWER.test(l));
  const at = lines.findIndex((l) => EXPLANATION.test(l));
  lines.splice(at === -1 ? lines.length : at, 0, `Answer: ${letter}`);
  return lines.join("\n");
}

// A line can carry several options ("A. Humerus B. Femur C. Tibia"). Split at the next letters in order, but only
// when there are at least two more of them or a wide gap, so "A. Hepatitis B. vaccine" stays one option.
function splitOptions(
  letter: string,
  text: string,
): { letter: string; text: string }[] {
  const cuts: { at: number; end: number; letter: string; wide: boolean }[] = [];
  let next = LETTERS.indexOf(letter) + 1;
  let from = 0;
  while (next < LETTERS.length) {
    const re = new RegExp(`(\\s+)${LETTERS[next]}[.)]\\s+`, "g");
    re.lastIndex = from;
    const m = re.exec(text);
    if (!m) break;
    cuts.push({
      at: m.index,
      end: m.index + m[0].length,
      letter: LETTERS[next],
      wide: m[1].length >= 2 || m[1].includes("\t"),
    });
    from = m.index + m[0].length;
    next++;
  }
  if (!cuts.length || (cuts.length < 2 && !cuts[0].wide))
    return [{ letter, text }];
  const out = [{ letter, text: text.slice(0, cuts[0].at) }];
  cuts.forEach((c, i) =>
    out.push({
      letter: c.letter,
      text: text.slice(c.end, cuts[i + 1]?.at ?? text.length),
    }),
  );
  return out.map((o) => ({ ...o, text: o.text.trim() }));
}

function finish(d: Draft): ParsedQuestion {
  const errors: string[] = [];
  const options = d.options.map((o) => o.text.trim());
  const prompt = d.prompt.join("\n").trim();
  if (!prompt) errors.push("Question text is empty.");
  if (prompt.length > 2000)
    errors.push("Question text is over 2000 characters.");
  if (options.some((o) => o.length > 500))
    errors.push("An option is over 500 characters.");
  if (options.length < 2) errors.push("Needs at least 2 options.");
  if (options.length > 5) errors.push("5 options at most.");
  if (options.some((o) => !o)) errors.push("An option is empty.");
  if (d.options.some((o, i) => o.letter !== LETTERS[i]))
    errors.push("Option letters are out of order.");
  if (options.every(Boolean) && new Set(options.map((o) => o.toLowerCase())).size !== options.length)
    errors.push("Two options are the same.");

  let correctIndex: number | null = null;
  if (!d.answer) {
    errors.push("No answer. Pick the right option.");
  } else {
    const i = d.options.findIndex((o) => o.letter === d.answer);
    if (i === -1) errors.push(`Answer ${d.answer} isn't one of the options.`);
    else correctIndex = i;
  }
  // Disagreeing answers: nothing is pre-picked, the trainer chooses.
  if (d.conflict) {
    errors.push(d.conflict);
    correctIndex = null;
  }
  const explanation = d.explanation.join("\n").trim();
  if (explanation.length > 2000)
    errors.push("Explanation is over 2000 characters.");

  const source =
    d.raw.join("\n") + (d.keyed && d.answer ? `\nAnswer: ${d.answer}` : "");
  return {
    number: d.number,
    line: d.line,
    source,
    letters: d.options.map((o) => o.letter),
    prompt,
    options,
    correctIndex,
    explanation,
    errors,
  };
}

export function parseQuestions(text: string): {
  items: ParsedQuestion[];
  skipped: SkippedLine[];
} {
  const drafts: Draft[] = [];
  const skipped: SkippedLine[] = [];
  let d: Draft | null = null;
  let afterKey = false;

  const applyKey = (
    entries: { number: number; letter: string; text: string }[],
    line: number,
  ) => {
    for (const e of entries) {
      const target = drafts.findLast((x) => x.number === e.number);
      if (!target)
        skipped.push({
          line,
          text: e.text,
          reason: `No question ${e.number} above`,
        });
      else if (target.answer && target.answer !== e.letter) {
        skipped.push({
          line,
          text: e.text,
          reason: `Question ${e.number} already has answer ${target.answer}`,
        });
        target.conflict = "Two answer lines. Pick the right option.";
      }
      else if (!target.answer) {
        target.answer = e.letter;
        target.keyed = true;
      }
    }
    afterKey = true;
    if (d) d.phase = "closed";
  };

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.trimEnd();
    if (!line.trim()) return;

    // Answer key lines are unambiguous ("12. C" is never a real question), so they go first.
    const heading = KEY_HEADING.exec(line);
    if (heading) {
      const rest = heading[1].trim();
      const entries = rest ? keyEntries(rest) : [];
      if (entries) {
        applyKey(entries, lineNo);
        return;
      }
    }
    const entries = keyEntries(line);
    if (entries) {
      applyKey(entries, lineNo);
      return;
    }

    if (PAGE_NUMBER.test(line)) {
      skipped.push({
        line: lineNo,
        text: line.trim(),
        reason: "Looks like a page number",
      });
      return;
    }

    // A numbered line starts a question when it can't be part of the current one: the first question, the next
    // number while still in the question text (so "3. wash hands" in a list stays put), or any higher number once
    // options have started. Numbers never go backwards, so a stray "1." later on can't split a question.
    const q = questionStart(line);
    if (
      q &&
      (!d ||
        (d.phase === "prompt" && q.number === d.number + 1) ||
        (d.phase !== "prompt" && q.number > d.number))
    ) {
      d = {
        number: q.number,
        line: lineNo,
        raw: [line.trim()],
        prompt: [q.rest],
        options: [],
        answer: null,
        keyed: false,
        conflict: null,
        explanation: [],
        phase: "prompt",
      };
      drafts.push(d);
      return;
    }
    if (!d) {
      skipped.push({
        line: lineNo,
        text: line.trim(),
        reason: "Before the first question",
      });
      return;
    }
    if (d.phase === "closed") {
      skipped.push({
        line: lineNo,
        text: line.trim(),
        reason: afterKey ? "After the answer key" : "Not part of a question",
      });
      return;
    }

    const a = ANSWER.exec(line);
    if (a && d.phase === "options") {
      d.answer = a[1].toUpperCase();
      d.phase = "answered";
      d.raw.push(line.trim());
      return;
    }
    // A second answer line: don't guess which one is right.
    if (a && (d.phase === "answered" || d.phase === "explanation")) {
      if (a[1].toUpperCase() !== d.answer) d.conflict = "Two answer lines. Pick the right option.";
      d.raw.push(line.trim());
      return;
    }

    const e = EXPLANATION.exec(line);
    if (e && d.phase !== "prompt") {
      d.explanation.push(e[1].trim());
      d.phase = "explanation";
      d.raw.push(line.trim());
      return;
    }

    if (d.phase === "explanation") {
      d.explanation.push(line.trim());
      d.raw.push(line.trim());
      return;
    }

    const o = OPTION.exec(line);
    if (o && (d.phase === "prompt" || d.phase === "options")) {
      d.options.push(...splitOptions(o[1].toUpperCase(), (o[2] ?? "").trim()));
      d.phase = "options";
      d.raw.push(line.trim());
      return;
    }

    if (d.phase === "prompt") {
      d.prompt.push(line.trim());
      d.raw.push(line.trim());
    } else if (d.phase === "options") {
      const last = d.options[d.options.length - 1];
      last.text = `${last.text} ${line.trim()}`.trim();
      d.raw.push(line.trim());
    } else {
      // Stray lines after the answer (page numbers, footers).
      skipped.push({
        line: lineNo,
        text: line.trim(),
        reason: `After the answer to question ${d.number}`,
      });
    }
  });

  return { items: drafts.map(finish), skipped };
}
