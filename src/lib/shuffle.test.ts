import { describe, expect, it } from "vitest";
import { permutation } from "./shuffle";

describe("permutation", () => {
  it("uses every index exactly once", () => {
    const order = permutation(40, "attempt-1");
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  it("is the same for the same seed and differs across seeds", () => {
    expect(permutation(20, "a:q1")).toEqual(permutation(20, "a:q1"));
    expect(permutation(20, "a:q1")).not.toEqual(permutation(20, "a:q2"));
  });

  it("handles empty and single lists", () => {
    expect(permutation(0, "x")).toEqual([]);
    expect(permutation(1, "x")).toEqual([0]);
  });

  it("actually moves things around", () => {
    const fixed = Array.from({ length: 200 }, (_, k) => permutation(4, `s${k}`)).filter((p) => p.join() === "0,1,2,3");
    // 1 in 24 by chance; far fewer than half.
    expect(fixed.length).toBeLessThan(40);
  });
});
