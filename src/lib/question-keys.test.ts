import { describe, expect, it } from "vitest";
import { choiceKey, isSaveKey, markKey } from "./question-keys";

const key = (
  k: string,
  extra: Partial<{
    code: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  }> = {},
) => ({
  key: k,
  code: extra.code ?? "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});

describe("choiceKey", () => {
  it("Enter moves to the next choice", () => {
    expect(choiceKey(key("Enter"), { index: 0, count: 4, value: "a" })).toBe(
      "next",
    );
  });

  it("Enter on the last choice adds one, up to 5", () => {
    expect(choiceKey(key("Enter"), { index: 3, count: 4, value: "d" })).toBe(
      "add",
    );
    expect(choiceKey(key("Enter"), { index: 4, count: 5, value: "e" })).toBe(
      "explanation",
    );
  });

  it("Backspace in an empty choice removes it, but keeps two", () => {
    expect(choiceKey(key("Backspace"), { index: 2, count: 4, value: "" })).toBe(
      "remove",
    );
    expect(
      choiceKey(key("Backspace"), { index: 1, count: 2, value: "" }),
    ).toBeNull();
    expect(
      choiceKey(key("Backspace"), { index: 2, count: 4, value: "x" }),
    ).toBeNull();
  });

  it("leaves modified Enter to the save shortcut", () => {
    expect(
      choiceKey(key("Enter", { ctrlKey: true }), {
        index: 0,
        count: 4,
        value: "a",
      }),
    ).toBeNull();
    expect(
      choiceKey(key("Enter", { shiftKey: true }), {
        index: 0,
        count: 4,
        value: "a",
      }),
    ).toBeNull();
  });
});

describe("isSaveKey", () => {
  it("is Ctrl+Enter or Cmd+Enter", () => {
    expect(isSaveKey(key("Enter", { ctrlKey: true }))).toBe(true);
    expect(isSaveKey(key("Enter", { metaKey: true }))).toBe(true);
    expect(isSaveKey(key("Enter"))).toBe(false);
  });
});

describe("markKey", () => {
  it("reads Alt plus a number anywhere, by key position so Option on a Mac works too", () => {
    expect(
      markKey(key("¡", { code: "Digit1", altKey: true }), {
        count: 4,
        onMark: false,
      }),
    ).toBe(0);
    expect(
      markKey(key("3", { code: "Digit3", altKey: true }), {
        count: 4,
        onMark: false,
      }),
    ).toBe(2);
    expect(
      markKey(key("1", { code: "Numpad1", altKey: true }), {
        count: 4,
        onMark: false,
      }),
    ).toBe(0);
  });

  it("reads a plain number only on the letter buttons, so typing digits still works", () => {
    expect(
      markKey(key("2", { code: "Digit2" }), { count: 4, onMark: true }),
    ).toBe(1);
    expect(
      markKey(key("2", { code: "Digit2" }), { count: 4, onMark: false }),
    ).toBeNull();
  });

  it("ignores numbers past the last choice", () => {
    expect(
      markKey(key("5", { code: "Digit5", altKey: true }), {
        count: 4,
        onMark: false,
      }),
    ).toBeNull();
    expect(
      markKey(key("0", { code: "Digit0", altKey: true }), {
        count: 4,
        onMark: false,
      }),
    ).toBeNull();
  });
});
