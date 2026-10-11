// Practice sets for the career page: a quiz or flashcards built from the questions you already answered.
// Pure helpers, safe on client and server. Only answers whose key you were shown count (is_correct and
// correct_index both set, the same rule career_items uses), so nothing here reads a key you couldn't already see.
import {
  filterEntries,
  latestPerQuestion,
  type CareerEntry,
  type CareerFilter,
} from "@/lib/career";

export const QUIZ_QUICK = 10;
export type QuizSize = "quick" | "complete";

export type PracticeRow = CareerEntry & {
  question_id: string | null;
  prompt: string;
  options: string[];
  correct_index: number | null;
  explanation: string | null;
};

// The distinct questions a set can use, each once at its newest answer, with a key you were shown.
export function practiceItems<T extends PracticeRow>(
  rows: T[],
  set: CareerFilter,
  favorites: ReadonlySet<string>,
): T[] {
  const shown = rows.filter(
    (r) => r.is_correct !== null && r.correct_index !== null,
  );
  return latestPerQuestion(filterEntries(shown, set, favorites));
}

// Quick: a random sample of up to QUIZ_QUICK, in random order. Complete: every item, in the order given.
export function quizQuestions<T>(
  items: T[],
  size: QuizSize,
  random: () => number = Math.random,
): T[] {
  if (size === "complete") return [...items];
  const out = [...items];
  const n = Math.min(QUIZ_QUICK, out.length);
  // Partial Fisher-Yates on a copy: the first n slots end up a uniform random sample.
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

export type PracticeCard = { id: string; term: string; definition: string };

// Term is the question, definition is the right option. Items without a key on screen are skipped.
export function flashcardsFrom(items: PracticeRow[]): PracticeCard[] {
  return items.flatMap((r) => {
    if (r.question_id === null || r.correct_index === null) return [];
    const definition = r.options[r.correct_index];
    if (definition === undefined) return [];
    return [{ id: r.question_id, term: r.prompt, definition }];
  });
}

// The four sets the practice panel offers, with the words the page uses.
export const PRACTICE_SETS: { set: CareerFilter; label: string }[] = [
  { set: "favorites", label: "Favourites" },
  { set: "all", label: "All answered" },
  { set: "right", label: "Got right" },
  { set: "wrong", label: "Got wrong" },
];
