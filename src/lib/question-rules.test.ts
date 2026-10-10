import { describe, expect, it } from "vitest";
import { IMPORT_BYTES_MAX, checkQuestion, importBytes } from "./question-rules";

const ok = { prompt: "Q?", choices: ["a", "b"], correct: 0, explanation: "" };

describe("checkQuestion", () => {
  it("passes a good question", () => {
    expect(checkQuestion(ok)).toEqual({});
  });

  it("needs question text, under 2000 characters", () => {
    expect(checkQuestion({ ...ok, prompt: "   " }).prompt).toBe(
      "Write the question.",
    );
    expect(checkQuestion({ ...ok, prompt: "x".repeat(2001) }).prompt).toMatch(
      /2000/,
    );
  });

  it("needs 2 to 5 filled, distinct choices under 500 characters", () => {
    expect(checkQuestion({ ...ok, choices: ["a"] }).choices).toBe(
      "Add at least two choices.",
    );
    expect(
      checkQuestion({ ...ok, choices: ["a", "b", "c", "d", "e", "f"] }).choices,
    ).toBe("5 choices at most.");
    expect(checkQuestion({ ...ok, choices: ["a", " "] }).choices).toBe(
      "Fill in every choice, or remove it.",
    );
    expect(
      checkQuestion({ ...ok, choices: ["a", "x".repeat(501)] }).choices,
    ).toMatch(/500/);
    expect(checkQuestion({ ...ok, choices: ["Same", "same "] }).choices).toBe(
      "Two choices are the same.",
    );
  });

  it("needs the right answer marked inside the range", () => {
    expect(checkQuestion({ ...ok, correct: 2 }).correct).toBe(
      "Mark the right answer.",
    );
    expect(checkQuestion({ ...ok, correct: -1 }).correct).toBe(
      "Mark the right answer.",
    );
  });

  it("caps the explanation", () => {
    expect(
      checkQuestion({ ...ok, explanation: "x".repeat(2001) }).explanation,
    ).toMatch(/2000/);
  });
});

describe("importBytes", () => {
  it("measures the request in UTF-8 bytes", () => {
    expect(importBytes([{ prompt: "é" }])).toBe(
      new TextEncoder().encode('[{"prompt":"é"}]').length,
    );
  });

  it("keeps a realistic 500-question test well under the cap", () => {
    const item = {
      prompt:
        "A 54 year old patient presents with chest pain radiating to the left arm. ".repeat(
          4,
        ),
      options: [
        "Myocardial infarction",
        "Angina pectoris",
        "Pericarditis",
        "Aortic dissection",
      ],
      correct: 0,
      explanation: "Classic presentation of an MI with referred pain.".repeat(
        2,
      ),
    };
    expect(importBytes(Array.from({ length: 500 }, () => item))).toBeLessThan(
      IMPORT_BYTES_MAX,
    );
  });
});
