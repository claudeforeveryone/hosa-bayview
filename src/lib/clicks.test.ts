import { describe, expect, it } from "vitest";
import { CLICK_CAP, clicksToReport } from "./clicks";

describe("clicksToReport", () => {
  it("sends the count as it is when it is small", () => {
    expect(clicksToReport(0)).toBe(0);
    expect(clicksToReport(7)).toBe(7);
  });

  it("never sends more than the cap", () => {
    expect(clicksToReport(CLICK_CAP)).toBe(CLICK_CAP);
    expect(clicksToReport(CLICK_CAP + 1)).toBe(CLICK_CAP);
    expect(clicksToReport(50_000)).toBe(CLICK_CAP);
  });

  it("treats negative, fractional and non-finite counts safely", () => {
    expect(clicksToReport(-3)).toBe(0);
    expect(clicksToReport(2.9)).toBe(2);
    expect(clicksToReport(Number.NaN)).toBe(0);
    expect(clicksToReport(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
