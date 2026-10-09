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
        prompt: 'What does the prefix "brady-" mean?',
        options: ["Fast", "Slow", "Large", "Small"],
        correctIndex: 1,
        explanation: "",
        errors: [],
      },
    ]);
  });

  it("handles several questions, blank lines and Windows line endings", () => {
    const text = "1. Q one\r\nA. a\r\nB. b\r\nAnswer: A\r\n\r\n\r\n2. Q two\r\nA. c\r\nB. d\r\nAnswer: B\r\n";
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
    for (const line of ["Answer: B", "ANSWER - B", "Ans: B", "Correct answer: B", "Answer: B. b", "Answer: (B)", "Answer:B"]) {
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
    expect(items[0].prompt).toBe("A patient presents with\na fever. What is it called?");
  });

  it("joins wrapped option text", () => {
    const { items } = parseQuestions(`1. Q
A. a long option that
wraps to the next line
B. b
Answer: B`);
    expect(items[0].options[0]).toBe("a long option that wraps to the next line");
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
    const { items, ignored } = parseQuestions(`Unit 3 practice test
Name: ______

1. Q
A. a
B. b
Answer: A`);
    expect(items).toHaveLength(1);
    expect(ignored).toBe(2);
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
    expect(items[0].prompt).toBe("Which is a vital sign,\ne.g. one taken at triage?");
    expect(items[0].options).toEqual(["Pulse", "Height"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseQuestions("   \n  ").items).toEqual([]);
  });
});
