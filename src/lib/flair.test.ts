import { describe, expect, it } from "vitest";
import { asBoardKind, FLAIR_MAX, parseFlair } from "./flair";

describe("parseFlair", () => {
  it("clears on blank", () => {
    expect(parseFlair("")).toEqual({ flair: null });
    expect(parseFlair("   ")).toEqual({ flair: null });
    expect(parseFlair(null)).toEqual({ flair: null });
  });

  it("trims and collapses spaces", () => {
    expect(parseFlair("  Med  Term  #1 ")).toEqual({ flair: "Med Term #1" });
  });

  it("caps the length", () => {
    expect(parseFlair("a".repeat(FLAIR_MAX))).toEqual({ flair: "a".repeat(FLAIR_MAX) });
    expect(parseFlair("a".repeat(FLAIR_MAX + 1))).toHaveProperty("error");
  });

  it("refuses emoji and odd characters", () => {
    expect(parseFlair("🔥 grind")).toHaveProperty("error");
    expect(parseFlair("<b>hi</b>")).toHaveProperty("error");
    expect(parseFlair("Rock & Roll!")).toEqual({ flair: "Rock & Roll!" });
  });
});

describe("asBoardKind", () => {
  it("falls back to member", () => {
    expect(asBoardKind("developer")).toBe("developer");
    expect(asBoardKind("jobless")).toBe("member");
    expect(asBoardKind(undefined)).toBe("member");
  });
});
