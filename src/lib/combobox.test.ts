import { describe, expect, it } from "vitest";
import { filterOptions, nextIndex } from "./combobox";

const EVENTS = ["Medical Math", "Nutrition", "Sports Medicine"];

describe("filterOptions", () => {
  it("shows everything until the user types", () => {
    expect(filterOptions(EVENTS, "Nutrition", false)).toEqual(EVENTS);
    expect(filterOptions(EVENTS, "  ", true)).toEqual(EVENTS);
  });

  it("matches anywhere, ignoring case", () => {
    expect(filterOptions(EVENTS, "MED", true)).toEqual(["Medical Math", "Sports Medicine"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterOptions(EVENTS, "Cardiology", true)).toEqual([]);
  });
});

describe("nextIndex", () => {
  it("starts at the first option going down and the last going up", () => {
    expect(nextIndex(-1, 1, 29)).toBe(0);
    expect(nextIndex(-1, -1, 29)).toBe(28);
  });

  it("wraps at both ends", () => {
    expect(nextIndex(28, 1, 29)).toBe(0);
    expect(nextIndex(0, -1, 29)).toBe(28);
  });

  it("recovers from an index past the end after filtering", () => {
    expect(nextIndex(10, 1, 3)).toBe(0);
  });

  it("has nowhere to go in an empty list", () => {
    expect(nextIndex(-1, 1, 0)).toBe(-1);
  });
});
