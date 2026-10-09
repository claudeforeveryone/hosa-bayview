import { describe, expect, it } from "vitest";
import { UNTITLED_DECK, UNTITLED_TEST, isUntitled } from "./untitled";

describe("isUntitled", () => {
  it("matches the placeholder name, ignoring surrounding spaces", () => {
    expect(isUntitled(UNTITLED_TEST, UNTITLED_TEST)).toBe(true);
    expect(isUntitled("  Untitled deck ", UNTITLED_DECK)).toBe(true);
  });

  it("is false once the item has been renamed", () => {
    expect(isUntitled("Femur quiz", UNTITLED_TEST)).toBe(false);
    expect(isUntitled("Untitled deck 2", UNTITLED_DECK)).toBe(false);
  });
});
