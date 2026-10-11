import { describe, expect, it } from "vitest";
import {
  REPORT_REASONS,
  checkReport,
  flagReason,
  reasonLabel,
} from "./flag-reasons";

describe("flagReason", () => {
  it("keeps a known reason", () => {
    expect(flagReason("wrong_answer")).toBe("wrong_answer");
    expect(flagReason("typo")).toBe("typo");
  });
  it("reads anything else as a plain Ask teacher, as before 0231", () => {
    expect(flagReason(undefined)).toBe("ask");
    expect(flagReason(null)).toBe("ask");
    expect(flagReason("boring")).toBe("ask");
  });
});

describe("the report reasons", () => {
  it("offer the four problems a member can report, not Ask teacher", () => {
    expect([...REPORT_REASONS]).toEqual([
      "wrong_answer",
      "unclear",
      "typo",
      "other",
    ]);
  });
  it("read the same words the trainer's notification uses", () => {
    expect(reasonLabel("wrong_answer")).toBe("Wrong answer key");
    expect(reasonLabel("unclear")).toBe("Unclear wording");
    expect(reasonLabel("typo")).toBe("Typo");
    expect(reasonLabel("other")).toBe("Something else");
  });
});

describe("checkReport", () => {
  it("passes a known reason with an optional short note", () => {
    expect(checkReport("typo", "")).toBeNull();
    expect(
      checkReport("wrong_answer", "The key says B, the book says C"),
    ).toBeNull();
  });
  it("names the problem", () => {
    expect(checkReport("ask", "")).toBe(
      "Pick what is wrong with the question.",
    );
    expect(checkReport("boring", "")).toBe(
      "Pick what is wrong with the question.",
    );
    expect(checkReport("typo", "a".repeat(501))).toBe(
      "Keep the note under 500 characters.",
    );
  });
});
