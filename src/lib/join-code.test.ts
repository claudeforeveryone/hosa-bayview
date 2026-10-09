import { describe, expect, it } from "vitest";
import { JOIN_CODE, displayCode, formNumber, normalizeCode } from "./join-code";

describe("normalizeCode", () => {
  it("uppercases and strips spaces and dashes", () => {
    expect(normalizeCode(" k7p-q2m ")).toBe("K7PQ2M");
    expect(normalizeCode("k7p q2m")).toBe("K7PQ2M");
  });

  it("handles missing input", () => {
    expect(normalizeCode(null)).toBe("");
    expect(normalizeCode(undefined)).toBe("");
  });
});

describe("JOIN_CODE", () => {
  it("accepts generated-style codes", () => {
    expect(JOIN_CODE.test("K7PQ2M")).toBe(true);
  });

  it("rejects lookalike characters and wrong lengths", () => {
    for (const bad of ["K7PQ2O", "K7PQ21", "K7PQ2I", "K7PQ2L", "K7PQ20", "K7PQ2", "K7PQ2MM"]) {
      expect(JOIN_CODE.test(bad)).toBe(false);
    }
  });
});

describe("display helpers", () => {
  it("splits codes into two groups", () => {
    expect(displayCode("K7PQ2M")).toBe("K7P Q2M");
    expect(displayCode("ABC")).toBe("ABC");
  });

  it("pads form numbers", () => {
    expect(formNumber("C", 4)).toBe("C-004");
    expect(formNumber("T", 1234)).toBe("T-1234");
  });
});
