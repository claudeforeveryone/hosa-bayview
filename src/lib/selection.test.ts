import { describe, expect, it } from "vitest";
import { cleanSelection, prefillCard, TERM_LIMIT } from "./selection";

describe("cleanSelection", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanSelection("  bone\n  marrow  ")).toBe("bone marrow");
  });

  it("returns null for blank or over-long selections", () => {
    expect(cleanSelection("   \n ")).toBeNull();
    expect(cleanSelection("x".repeat(TERM_LIMIT + 1))).toBeNull();
    expect(cleanSelection("x".repeat(TERM_LIMIT))).toBe("x".repeat(TERM_LIMIT));
  });
});

describe("prefillCard", () => {
  it("uses the selection as the term and the correct answer as the definition", () => {
    expect(prefillCard("tibia", "The shin bone")).toEqual({
      term: "tibia",
      definition: "The shin bone",
    });
  });

  it("leaves the definition blank when the answer is not known", () => {
    expect(prefillCard("tibia", null)).toEqual({
      term: "tibia",
      definition: "",
    });
  });
});
