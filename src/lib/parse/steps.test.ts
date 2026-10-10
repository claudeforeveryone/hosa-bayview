import { describe, expect, it } from "vitest";
import { cleanSteps, parseSteps, stepsToText, totalPoints } from "./steps";

describe("parseSteps", () => {
  it("reads one step per line with optional trailing points", () => {
    expect(parseSteps("Wash hands | 2\nDon gloves")).toEqual([
      { text: "Wash hands", points: 2 },
      { text: "Don gloves" },
    ]);
  });

  it("ignores blank lines and Windows line endings", () => {
    expect(parseSteps("\r\nWash hands\r\n\r\n   \r\nDon gloves\r\n")).toEqual([
      { text: "Wash hands" },
      { text: "Don gloves" },
    ]);
  });

  it("drops list markers a pasted rating sheet brings along", () => {
    expect(parseSteps("1. Wash hands\n2) Don gloves | 1\n- Greet patient\n• Explain")).toEqual([
      { text: "Wash hands" },
      { text: "Don gloves", points: 1 },
      { text: "Greet patient" },
      { text: "Explain" },
    ]);
  });

  it("keeps numbers that are part of the step", () => {
    expect(parseSteps("1.5 mL into the vial")).toEqual([{ text: "1.5 mL into the vial" }]);
  });

  it("keeps a pipe that is not followed by a number as text", () => {
    expect(parseSteps("Check ID | name and DOB")).toEqual([{ text: "Check ID | name and DOB" }]);
  });

  it("reads zero points and leaves invalid point values for validation", () => {
    expect(parseSteps("Optional | 0\nHalf | 2.5")).toEqual([
      { text: "Optional", points: 0 },
      { text: "Half", points: 2.5 },
    ]);
  });

  it("returns nothing for an empty box", () => {
    expect(parseSteps("  \n\n")).toEqual([]);
  });
});

describe("stepsToText", () => {
  it("round-trips through parseSteps", () => {
    const steps = [{ text: "Wash hands", points: 2 }, { text: "Don gloves" }];
    expect(stepsToText(steps)).toBe("Wash hands | 2\nDon gloves");
    expect(parseSteps(stepsToText(steps))).toEqual(steps);
  });
});

describe("totalPoints", () => {
  it("adds the scored steps, or null when no step is scored", () => {
    expect(totalPoints([{ text: "a", points: 2 }, { text: "b" }, { text: "c", points: 3 }])).toBe(5);
    expect(totalPoints([{ text: "a" }])).toBeNull();
    expect(totalPoints([])).toBeNull();
  });
});

describe("cleanSteps", () => {
  it("keeps well-formed steps from the database and drops the rest", () => {
    expect(
      cleanSteps([
        { text: "Wash hands", points: 2 },
        { text: "Don gloves" },
        { text: "" },
        { points: 3 },
        "loose string",
        null,
        { text: "Bad points", points: "5" },
      ]),
    ).toEqual([{ text: "Wash hands", points: 2 }, { text: "Don gloves" }, { text: "Bad points" }]);
  });

  it("reads anything that is not an array as no steps", () => {
    expect(cleanSteps(null)).toEqual([]);
    expect(cleanSteps({ text: "x" })).toEqual([]);
  });
});
