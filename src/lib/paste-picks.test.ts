import { describe, expect, it } from "vitest";
import { parseQuestions } from "./parse/questions";
import { leftoverText, pickKey, withPick } from "./paste-picks";

const TEXT = "1. One\nA. a\nB. b\nAnswer: B\n\n2. Two\nA. c\nB. d\nC. c";

describe("pickKey", () => {
  it("survives an edit to another question", () => {
    const before = parseQuestions(TEXT).items;
    const after = parseQuestions(TEXT.replace("2. Two", "2. Two, fixed")).items;
    expect(pickKey(after[0])).toBe(pickKey(before[0]));
    expect(pickKey(after[1])).not.toBe(pickKey(before[1]));
  });
});

describe("withPick", () => {
  it("a pick settles answer errors, but not other problems", () => {
    const [, two] = parseQuestions(TEXT).items;
    expect(two.errors).toEqual([
      "Two options are the same.",
      "No answer. Pick the right option.",
    ]);
    expect(withPick(two, 1)).toEqual({
      correct: 1,
      errors: ["Two options are the same."],
    });
  });

  it("a pick settles two disagreeing answer lines", () => {
    const [q] = parseQuestions("1. Q\nA. a\nB. b\nAnswer: A\nAnswer: B").items;
    expect(withPick(q, 1)).toEqual({ correct: 1, errors: [] });
  });
});

describe("leftoverText", () => {
  it("writes the trainer's pick into a question going back in the box", () => {
    const items = parseQuestions(TEXT).items;
    const back = leftoverText(items, new Set([0, 1]), {
      [pickKey(items[0])]: 0,
      [pickKey(items[1])]: 1,
    });
    const again = parseQuestions(back).items;
    // The corrected pick (A), not the original "Answer: B".
    expect(again[0].correctIndex).toBe(0);
    expect(again[1].correctIndex).toBe(1);
  });

  it("leaves a question without a pick as it was typed", () => {
    const items = parseQuestions(TEXT).items;
    expect(leftoverText(items, new Set([1]), {})).toBe(
      "2. Two\nA. c\nB. d\nC. c",
    );
  });
});
