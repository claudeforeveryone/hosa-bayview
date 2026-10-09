import { describe, expect, it } from "vitest";
import {
  attemptsLeft,
  parseAttemptsAllowed,
  practiceRuleOk,
  scoredMode,
} from "./test-settings";

describe("parseAttemptsAllowed", () => {
  it("treats blank as unlimited", () => {
    expect(parseAttemptsAllowed("")).toEqual({ ok: true, value: null });
    expect(parseAttemptsAllowed("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts whole numbers from 1 to 100", () => {
    expect(parseAttemptsAllowed("1")).toEqual({ ok: true, value: 1 });
    expect(parseAttemptsAllowed(" 100 ")).toEqual({ ok: true, value: 100 });
  });

  it("rejects zero, too big, decimals and words", () => {
    for (const bad of ["0", "101", "2.5", "-3", "three"]) {
      expect(parseAttemptsAllowed(bad).ok).toBe(false);
    }
  });
});

describe("scoredMode", () => {
  it("scores timed runs when there is a time limit, practice otherwise", () => {
    expect(scoredMode(30)).toBe("timed");
    expect(scoredMode(null)).toBe("practice");
  });
});

describe("attemptsLeft", () => {
  it("is null for unlimited and never goes below zero", () => {
    expect(attemptsLeft(null, 99)).toBeNull();
    expect(attemptsLeft(3, 1)).toBe(2);
    expect(attemptsLeft(2, 5)).toBe(0);
  });
});

describe("practiceRuleOk", () => {
  it("needs practice on when there is no time limit", () => {
    expect(practiceRuleOk(null, false)).toBe(false);
    expect(practiceRuleOk(null, true)).toBe(true);
    expect(practiceRuleOk(20, false)).toBe(true);
  });
});
