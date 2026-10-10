import { describe, expect, it } from "vitest";
import { parseQuestions } from "./questions";

describe("parseQuestions", () => {
  it("reads the standard format", () => {
    const { items } = parseQuestions(`1. What does the prefix "brady-" mean?
A. Fast
B. Slow
C. Large
D. Small
Answer: B`);
    expect(items).toEqual([
      {
        number: 1,
        line: 1,
        source:
          '1. What does the prefix "brady-" mean?\nA. Fast\nB. Slow\nC. Large\nD. Small\nAnswer: B',
        prompt: 'What does the prefix "brady-" mean?',
        options: ["Fast", "Slow", "Large", "Small"],
        correctIndex: 1,
        explanation: "",
        errors: [],
      },
    ]);
  });

  it("handles several questions, blank lines and Windows line endings", () => {
    const text =
      "1. Q one\r\nA. a\r\nB. b\r\nAnswer: A\r\n\r\n\r\n2. Q two\r\nA. c\r\nB. d\r\nAnswer: B\r\n";
    const { items } = parseQuestions(text);
    expect(items.map((q) => [q.prompt, q.correctIndex])).toEqual([
      ["Q one", 0],
      ["Q two", 1],
    ]);
  });

  it("accepts A) (A) and lowercase option markers, and 1) numbering", () => {
    const { items } = parseQuestions(`1) Pick one
(A) first
b) second
C. third
d) fourth
Answer: c`);
    expect(items[0].options).toEqual(["first", "second", "third", "fourth"]);
    expect(items[0].correctIndex).toBe(2);
    expect(items[0].errors).toEqual([]);
  });

  it("supports a fifth option", () => {
    const { items } = parseQuestions(`1. Q
A. a
B. b
C. c
D. d
E. e
Answer: E`);
    expect(items[0].options).toHaveLength(5);
    expect(items[0].correctIndex).toBe(4);
  });

  it("reads answer variants", () => {
    for (const line of [
      "Answer: B",
      "ANSWER - B",
      "Ans: B",
      "Correct answer: B",
      "Answer: B. b",
      "Answer: (B)",
      "Answer:B",
    ]) {
      const { items } = parseQuestions(`1. Q\nA. a\nB. b\n${line}`);
      expect(items[0].correctIndex, line).toBe(1);
    }
  });

  it("keeps explanations, including multi-line ones", () => {
    const { items } = parseQuestions(`1. Q
A. a
B. b
Answer: A
Explanation: Because a.
It really is a.`);
    expect(items[0].explanation).toBe("Because a.\nIt really is a.");
  });

  it("joins multi-line question text", () => {
    const { items } = parseQuestions(`1. A patient presents with
a fever. What is it called?
A. Pyrexia
B. Apnea
Answer: A`);
    expect(items[0].prompt).toBe(
      "A patient presents with\na fever. What is it called?",
    );
  });

  it("joins wrapped option text", () => {
    const { items } = parseQuestions(`1. Q
A. a long option that
wraps to the next line
B. b
Answer: B`);
    expect(items[0].options[0]).toBe(
      "a long option that wraps to the next line",
    );
  });

  it("flags a missing answer without dropping the question", () => {
    const { items } = parseQuestions(`1. Q
A. a
B. b`);
    expect(items[0].correctIndex).toBeNull();
    expect(items[0].errors).toContain("No answer. Pick the right option.");
  });

  it("flags an answer letter with no matching option", () => {
    const { items } = parseQuestions(`1. Q
A. a
B. b
Answer: D`);
    expect(items[0].correctIndex).toBeNull();
    expect(items[0].errors[0]).toMatch(/D/);
  });

  it("flags questions with fewer than two options", () => {
    const { items } = parseQuestions(`1. Q
A. only
Answer: A`);
    expect(items[0].errors).toContain("Needs at least 2 options.");
  });

  it("flags out-of-order option letters", () => {
    const { items } = parseQuestions(`1. Q
A. a
C. c
Answer: A`);
    expect(items[0].errors.some((e) => e.includes("order"))).toBe(true);
  });

  it("ignores junk before the first numbered question", () => {
    const { items, skipped } = parseQuestions(`Unit 3 practice test
Name: ______

1. Q
A. a
B. b
Answer: A`);
    expect(items).toHaveLength(1);
    expect(skipped).toEqual([
      {
        line: 1,
        text: "Unit 3 practice test",
        reason: "Before the first question",
      },
      { line: 2, text: "Name: ______", reason: "Before the first question" },
    ]);
  });

  it("does not split on numbers inside question text", () => {
    const { items } = parseQuestions(`1. Normal adult heart rate is
60 to 100 beats per minute. True?
A. Yes
B. No
Answer: A`);
    expect(items).toHaveLength(1);
  });

  it("does not mistake e.g. at the start of a line for option E", () => {
    const { items } = parseQuestions(`1. Which is a vital sign,
e.g. one taken at triage?
A. Pulse
B. Height
Answer: A`);
    expect(items[0].prompt).toBe(
      "Which is a vital sign,\ne.g. one taken at triage?",
    );
    expect(items[0].options).toEqual(["Pulse", "Height"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseQuestions("   \n  ")).toEqual({ items: [], skipped: [] });
  });
});

describe("parseQuestions numbering styles", () => {
  const body = "\nA. a\nB. b\nAnswer: B";
  for (const [style, line] of [
    ["1.", "1. Pick"],
    ["1)", "1) Pick"],
    ["1:", "1: Pick"],
    ["no space", "1.Pick"],
    ["Q1.", "Q1. Pick"],
    ["Q1)", "q1) Pick"],
    ["Question 1:", "Question 1: Pick"],
    ["Question 1 alone", "Question 1\nPick"],
    ["indented", "   1.   Pick"],
  ] as const) {
    it(`reads ${style}`, () => {
      const { items } = parseQuestions(line + body);
      expect(items).toHaveLength(1);
      expect(items[0].prompt).toBe("Pick");
      expect(items[0].correctIndex).toBe(1);
      expect(items[0].errors).toEqual([]);
    });
  }

  it("does not read a decimal as a question number", () => {
    const { items, skipped } = parseQuestions(
      "1.5 mg is the dose\n1. Real\nA. a\nB. b\nAnswer: A",
    );
    expect(items.map((q) => q.prompt)).toEqual(["Real"]);
    expect(skipped[0].text).toBe("1.5 mg is the dose");
  });

  it("starts a new question when numbers skip, even without answer lines", () => {
    const { items } = parseQuestions(
      "1. One\nA. a\nB. b\n3. Three\nA. c\nB. d",
    );
    expect(items.map((q) => [q.number, q.prompt, q.options])).toEqual([
      [1, "One", ["a", "b"]],
      [3, "Three", ["c", "d"]],
    ]);
  });

  it("keeps a numbered list inside a prompt together", () => {
    const { items } = parseQuestions(
      "1. Put in order:\n3. wash hands\n4. glove\nA. 3 then 4\nB. 4 then 3\nAnswer: A",
    );
    expect(items).toHaveLength(1);
    expect(items[0].prompt).toBe("Put in order:\n3. wash hands\n4. glove");
  });
});

describe("parseQuestions answers", () => {
  it("reads Ans. B, Correct answer is B and a bare Answer B", () => {
    for (const line of [
      "Ans. B",
      "Correct answer is B",
      "Answer B",
      "answer: b",
    ]) {
      const { items } = parseQuestions(`1. Q\nA. a\nB. b\n${line}`);
      expect(items[0].correctIndex, line).toBe(1);
    }
  });

  it("does not read 'Answer a question' in a prompt as the key", () => {
    const { items } = parseQuestions(
      "1. Read the case below.\nAnswer a question about it:\nA. a\nB. b\nAnswer: B",
    );
    expect(items[0].prompt).toBe(
      "Read the case below.\nAnswer a question about it:",
    );
    expect(items[0].correctIndex).toBe(1);
  });

  it("reads an answer key at the end", () => {
    const { items, skipped } = parseQuestions(`1. One
A. a
B. b
2. Two
A. c
B. d
C. e

Answer Key
1. B
2) c`);
    expect(items.map((q) => q.correctIndex)).toEqual([1, 2]);
    expect(items.every((q) => q.errors.length === 0)).toBe(true);
    expect(skipped).toEqual([]);
  });

  it("reads several key entries on one line, with or without a heading", () => {
    const { items } = parseQuestions(
      "1. One\nA. a\nB. b\n2. Two\nA. c\nB. d\n1. A 2. B",
    );
    expect(items.map((q) => q.correctIndex)).toEqual([0, 1]);
    const keyed = parseQuestions(
      "1. One\nA. a\nB. b\n2. Two\nA. c\nB. d\nAnswers: 1-B, 2-A",
    );
    expect(keyed.items.map((q) => q.correctIndex)).toEqual([1, 0]);
  });

  it("skips key entries for questions that are not there, with the reason", () => {
    const { skipped } = parseQuestions(
      "1. One\nA. a\nB. b\nAnswer key\n1. A\n7. C",
    );
    expect(skipped).toEqual([
      { line: 6, text: "7. C", reason: "No question 7 above" },
    ]);
  });

  it("keeps the inline answer when a key disagrees, and says so", () => {
    const { items, skipped } = parseQuestions(
      "1. One\nA. a\nB. b\nAnswer: A\nAnswer key\n1. B",
    );
    expect(items[0].correctIndex).toBe(0);
    expect(skipped).toEqual([
      { line: 6, text: "1. B", reason: "Question 1 already has answer A" },
    ]);
  });

  it("leaves a question with no key out, with the reason", () => {
    const { items } = parseQuestions(
      "1. One\nA. a\nB. b\n2. Two\nA. c\nB. d\nAnswer: A",
    );
    expect(items[0].correctIndex).toBeNull();
    expect(items[0].errors).toEqual(["No answer. Pick the right option."]);
    expect(items[1].correctIndex).toBe(0);
  });
});

describe("parseQuestions layout", () => {
  it("splits options written on one line", () => {
    const { items } = parseQuestions(
      "1. Longest bone?\nA. Humerus B. Femur C. Tibia D. Fibula\nAnswer: B",
    );
    expect(items[0].options).toEqual(["Humerus", "Femur", "Tibia", "Fibula"]);
    expect(items[0].correctIndex).toBe(1);
  });

  it("does not split an option that mentions a letter", () => {
    const { items } = parseQuestions(
      "1. Q\nA. Vitamin A deficiency\nB. Hepatitis B. vaccine\nAnswer: A",
    );
    expect(items[0].options).toEqual([
      "Vitamin A deficiency",
      "Hepatitis B. vaccine",
    ]);
  });

  it("skips page numbers instead of gluing them onto an option", () => {
    const { items, skipped } = parseQuestions(
      "1. Q\nA. a\nB. b\nPage 1 of 4\n12\n- 3 -\nAnswer: A",
    );
    expect(items[0].options).toEqual(["a", "b"]);
    expect(items[0].correctIndex).toBe(0);
    expect(skipped.map((s) => [s.line, s.reason])).toEqual([
      [4, "Looks like a page number"],
      [5, "Looks like a page number"],
      [6, "Looks like a page number"],
    ]);
  });

  it("explains lines after the answer that it drops", () => {
    const { skipped } = parseQuestions(
      "1. Q\nA. a\nB. b\nAnswer: A\nCopyright HOSA 2021",
    );
    expect(skipped).toEqual([
      {
        line: 5,
        text: "Copyright HOSA 2021",
        reason: "After the answer to question 1",
      },
    ]);
  });

  it("keeps each question's own source text so leftovers can go back in the box", () => {
    const { items } = parseQuestions(
      "1. One\nA. a\nB. b\n\n2. Two\nA. c\nB. d\nAnswer key\n1. A",
    );
    expect(items[0].source).toBe("1. One\nA. a\nB. b\nAnswer: A");
    expect(items[1].source).toBe("2. Two\nA. c\nB. d");
    expect(items.map((q) => q.line)).toEqual([1, 5]);
  });

  it("parses 500 questions quickly", () => {
    const one = (i: number) =>
      `${i}. Question ${i} about a patient with a fever?\nA. Pyrexia\nB. Apnea\nC. Bradycardia\nD. Dyspnea\nAnswer: A\nExplanation: Fever.`;
    const text = Array.from({ length: 500 }, (_, i) => one(i + 1)).join("\n\n");
    const t = performance.now();
    const { items } = parseQuestions(text);
    expect(performance.now() - t).toBeLessThan(100);
    expect(items).toHaveLength(500);
    expect(items.every((q) => q.errors.length === 0)).toBe(true);
  });
});
