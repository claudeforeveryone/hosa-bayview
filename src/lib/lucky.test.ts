import { describe, expect, it } from "vitest";
import {
  JACKPOT,
  formatBonusLine,
  isJackpot,
  isLuckyReason,
  luckyDuration,
  parseLuckyEvent,
  parseRollResult,
  particleCount,
} from "@/lib/lucky";

describe("reasons", () => {
  it("accepts only the three reasons the server pays for", () => {
    expect(isLuckyReason("visit")).toBe(true);
    expect(isLuckyReason("test")).toBe(true);
    expect(isLuckyReason("flashcards")).toBe(true);
    expect(isLuckyReason("match")).toBe(false);
    expect(isLuckyReason(undefined)).toBe(false);
  });
});

describe("roll results", () => {
  it("reads whole amounts from 1 to 50 and treats 0 or junk as no bonus", () => {
    expect(parseRollResult(0)).toBeNull();
    expect(parseRollResult(5)).toBe(5);
    expect(parseRollResult(25)).toBe(25);
    expect(parseRollResult(50)).toBe(50);
    expect(parseRollResult("12")).toBe(12);
    expect(parseRollResult(51)).toBeNull();
    expect(parseRollResult(7.5)).toBeNull();
    expect(parseRollResult(null)).toBeNull();
    expect(parseRollResult({})).toBeNull();
  });

  it("checks the event detail before it reaches the overlay", () => {
    expect(parseLuckyEvent({ amount: 9, reason: "test" })).toEqual({
      amount: 9,
      reason: "test",
    });
    expect(parseLuckyEvent({ amount: 9, reason: "bogus" })).toBeNull();
    expect(parseLuckyEvent({ amount: 0, reason: "visit" })).toBeNull();
    expect(parseLuckyEvent(null)).toBeNull();
  });
});

describe("jackpot", () => {
  it("is 50 and only 50 or more", () => {
    expect(JACKPOT).toBe(50);
    expect(isJackpot(25)).toBe(false);
    expect(isJackpot(50)).toBe(true);
  });

  it("stays up longer and bursts bigger than a regular bonus", () => {
    expect(luckyDuration(50)).toBeGreaterThan(luckyDuration(12));
    expect(particleCount(50)).toBeGreaterThan(particleCount(12));
  });
});

describe("profile line", () => {
  it("lists the bonuses in order with their reason labels", () => {
    expect(
      formatBonusLine([
        { amount: 12, reason: "visit" },
        { amount: 50, reason: "test" },
        { amount: 8, reason: "flashcards" },
      ]),
    ).toBe("+12 Visit · +50 Test · +8 Flashcards");
  });

  it("is empty when there are no bonuses", () => {
    expect(formatBonusLine([])).toBe("");
  });
});
