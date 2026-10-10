// One multiple-choice question's rules, shared by the editor (checks before it clears the form) and the server
// action (checks again; the database checks a third time). Messages are the ones the editor shows.

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 5;
// Questions per paste import. The database (import_questions_bulk) holds the same cap.
export const IMPORT_MAX = 500;
// Server actions accept 2 MB here (next.config.ts); keep headroom for the request's own wrapping.
export const IMPORT_BYTES_MAX = 1_800_000;

export type QuestionInput = {
  prompt: string;
  choices: string[];
  correct: number;
  explanation: string;
};

export function checkQuestion(
  q: QuestionInput,
): Partial<Record<"prompt" | "choices" | "correct" | "explanation", string>> {
  const out: Partial<
    Record<"prompt" | "choices" | "correct" | "explanation", string>
  > = {};
  const prompt = q.prompt.trim();
  if (!prompt) out.prompt = "Write the question.";
  else if (prompt.length > 2000)
    out.prompt = "Keep the question under 2000 characters.";

  const choices = q.choices.map((c) => c.trim());
  if (choices.length < MIN_CHOICES) out.choices = "Add at least two choices.";
  else if (choices.length > MAX_CHOICES) out.choices = "5 choices at most.";
  else if (choices.some((c) => c === ""))
    out.choices = "Fill in every choice, or remove it.";
  else if (choices.some((c) => c.length > 500))
    out.choices = "Keep choices under 500 characters.";
  else if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length)
    out.choices = "Two choices are the same.";

  if (
    !out.choices &&
    (!Number.isInteger(q.correct) ||
      q.correct < 0 ||
      q.correct >= choices.length)
  )
    out.correct = "Mark the right answer.";
  if (q.explanation.trim().length > 2000)
    out.explanation = "Keep the explanation under 2000 characters.";
  return out;
}

// Size of an import as the action will send it.
export function importBytes(items: unknown): number {
  return new TextEncoder().encode(JSON.stringify(items)).length;
}
