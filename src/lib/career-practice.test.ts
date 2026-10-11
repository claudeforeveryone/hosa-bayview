import { describe, expect, it } from "vitest";
import {
  flashcardsFrom,
  practiceItems,
  quizQuestions,
  type PracticeRow,
} from "./career-practice";

function row(
  question_id: string | null,
  answered_at: string,
  is_correct: boolean | null,
  correct_index: number | null = is_correct === null ? null : 1,
): PracticeRow {
  return {
    answered_at,
    is_correct,
    question_id,
    prompt: `Prompt ${question_id}`,
    options: ["A", "B", "C", "D"],
    correct_index,
    explanation: null,
  };
}

const rows: PracticeRow[] = [
  row("q1", "2026-10-10T15:00:00Z", true, 2),
  row("q1", "2026-10-09T15:00:00Z", false, 2),
  row("q2", "2026-10-08T15:00:00Z", false, 0),
  row("q3", "2026-10-07T15:00:00Z", null), // key hidden from you: never in a set
  row(null, "2026-10-06T15:00:00Z", null),
];
const favs = new Set(["q1", "q3"]);

describe("practiceItems", () => {
  it("uses each question once, at its newest answer, and only shown keys", () => {
    expect(practiceItems(rows, "all", favs).map((r) => r.question_id)).toEqual([
      "q1",
      "q2",
    ]);
    expect(practiceItems(rows, "all", favs)[0].is_correct).toBe(true);
  });

  it("filters by verdict", () => {
    expect(
      practiceItems(rows, "right", favs).map((r) => r.question_id),
    ).toEqual(["q1"]);
    expect(
      practiceItems(rows, "wrong", favs).map((r) => r.question_id),
    ).toEqual(["q1", "q2"]); // q1 was also answered wrong once
  });

  it("favourites: starred questions with a shown key, once each", () => {
    // q3 is starred but its key is hidden, so it doesn't count.
    expect(
      practiceItems(rows, "favorites", favs).map((r) => r.question_id),
    ).toEqual(["q1"]);
    expect(practiceItems(rows, "favorites", new Set())).toEqual([]);
  });
});

describe("quizQuestions", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it("complete keeps every item in order", () => {
    expect(quizQuestions(items, "complete")).toEqual(items);
  });

  it("quick takes 10 distinct items", () => {
    const picked = quizQuestions(items, "quick", () => 0.5);
    expect(picked).toHaveLength(10);
    expect(new Set(picked).size).toBe(10);
    for (const p of picked) expect(items).toContain(p);
  });

  it("quick with fewer than 10 takes them all", () => {
    expect(quizQuestions([1, 2, 3], "quick").sort()).toEqual([1, 2, 3]);
    expect(quizQuestions([], "quick")).toEqual([]);
  });

  it("does not change the input", () => {
    const copy = [...items];
    quizQuestions(items, "quick");
    expect(items).toEqual(copy);
  });
});

describe("flashcardsFrom", () => {
  it("makes the question the term and the right option the definition", () => {
    expect(flashcardsFrom(practiceItems(rows, "all", favs))).toEqual([
      { id: "q1", term: "Prompt q1", definition: "C" },
      { id: "q2", term: "Prompt q2", definition: "A" },
    ]);
  });

  it("skips anything without a shown key", () => {
    expect(flashcardsFrom([row("q9", "2026-10-01T15:00:00Z", null)])).toEqual(
      [],
    );
  });
});
