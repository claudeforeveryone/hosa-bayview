// Test settings shared by the editor, the take page and the server rules. Defaults match the behaviour before settings existed.

export type TestSettings = {
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  allow_practice: boolean;
  show_answers: boolean;
  attempts_allowed: number | null;
};

export const DEFAULT_SETTINGS: TestSettings = {
  shuffle_questions: true,
  shuffle_choices: true,
  allow_practice: true,
  show_answers: true,
  attempts_allowed: null,
};

export const ATTEMPTS_MAX = 100;

// Blank means unlimited. Anything else must be a whole number from 1 to ATTEMPTS_MAX.
export function parseAttemptsAllowed(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const v = raw.trim();
  if (v === "") return { ok: true, value: null };
  if (!/^\d+$/.test(v))
    return {
      ok: false,
      error: "Use a whole number, or leave it blank for unlimited.",
    };
  const n = Number(v);
  if (n < 1 || n > ATTEMPTS_MAX)
    return {
      ok: false,
      error: `Use 1 to ${ATTEMPTS_MAX}, or leave it blank for unlimited.`,
    };
  return { ok: true, value: n };
}

// A timed test scores its timed runs; without a time limit the practice runs are the scored ones.
export function scoredMode(timeLimit: number | null): "timed" | "practice" {
  return timeLimit ? "timed" : "practice";
}

// Null means unlimited. Otherwise how many scored attempts are still open to the taker.
export function attemptsLeft(
  allowed: number | null,
  used: number,
): number | null {
  if (allowed === null) return null;
  return Math.max(0, allowed - used);
}

// Practice has to stay on when there is no time limit, or the test can't be started at all.
export function practiceRuleOk(
  timeLimit: number | null,
  allowPractice: boolean,
): boolean {
  return timeLimit !== null || allowPractice;
}

// Shown in place of a score the database withheld (answers hidden on the test). Practice on a timed test never
// scores; a scored run shows its score only when every question was answered.
export function hiddenScoreNote(mode: "timed" | "practice", timeLimit: number | null): string {
  return mode === "practice" && scoredMode(timeLimit) === "timed"
    ? "Answers are hidden on this test, so practice runs don't show a score."
    : "Answers are hidden on this test. Answer every question to see your score.";
}
