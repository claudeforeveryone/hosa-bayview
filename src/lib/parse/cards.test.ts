import { describe, expect, it } from "vitest";
import { parseCards, DEFINITION_MAX, TERM_MAX } from "./cards";

describe("parseCards", () => {
  it("splits on a tab", () => {
    expect(parseCards("Femur\tLongest bone in the body").items).toEqual([
      { line: 1, term: "Femur", definition: "Longest bone in the body" },
    ]);
  });

  it("splits on a spaced hyphen, en dash and em dash", () => {
    const { items, errors } = parseCards("Ulna - forearm bone\nRadius – forearm bone too\nTibia — shin bone");
    expect(errors).toEqual([]);
    expect(items.map((c) => [c.term, c.definition])).toEqual([
      ["Ulna", "forearm bone"],
      ["Radius", "forearm bone too"],
      ["Tibia", "shin bone"],
    ]);
  });

  it("splits on a colon and keeps later colons in the definition", () => {
    expect(parseCards("Ratio: 1 part to 2 parts: mixed").items[0]).toEqual({
      line: 1,
      term: "Ratio",
      definition: "1 part to 2 parts: mixed",
    });
  });

  it("keeps hyphens inside a term when the separator is spaced", () => {
    expect(parseCards("Brady-cardia - slow heart rate").items[0]).toMatchObject({
      term: "Brady-cardia",
      definition: "slow heart rate",
    });
  });

  it("skips blank lines and handles Windows line endings", () => {
    const { items, errors } = parseCards("A: one\r\n\r\n\r\nB: two\r\n");
    expect(errors).toEqual([]);
    expect(items.map((c) => c.line)).toEqual([1, 4]);
  });

  it("reports lines it cannot read without dropping the good ones", () => {
    const { items, errors } = parseCards("Good: yes\nno separator here\n: missing term\nMissing def:   ");
    expect(items).toEqual([{ line: 1, term: "Good", definition: "yes" }]);
    expect(errors.map((e) => [e.line, e.message])).toEqual([
      [2, "No separator. Use a tab, ' - ', ' — ' or a colon."],
      [3, "The term is empty."],
      [4, "The definition is empty."],
    ]);
  });

  it("rejects terms and definitions over the stored limits", () => {
    const longTerm = "t".repeat(TERM_MAX + 1);
    const longDef = "d".repeat(DEFINITION_MAX + 1);
    const { items, errors } = parseCards(`${longTerm}: ok\nok: ${longDef}`);
    expect(items).toEqual([]);
    expect(errors.map((e) => e.line)).toEqual([1, 2]);
  });

  it("does not split times or ratios on a colon with no space after it", () => {
    const { items, errors } = parseCards("Lunch 9:30 am\nRatio 3:1\nNote:yes");
    expect(items).toEqual([]);
    expect(errors.map((e) => e.line)).toEqual([1, 2, 3]);
  });

  it("splits on a colon that is followed by a time or ratio", () => {
    expect(parseCards("Start: 9:30 am\nRatio: 3:1").items).toEqual([
      { line: 1, term: "Start", definition: "9:30 am" },
      { line: 2, term: "Ratio", definition: "3:1" },
    ]);
  });

  it("splits on a colon at the end of a line only as far as the definition, which is then empty", () => {
    expect(parseCards("Femur:").errors).toEqual([{ line: 1, text: "Femur:", message: "The definition is empty." }]);
  });

  it("prefers a tab, then a spaced dash, then a colon", () => {
    expect(parseCards("A: b\tc").items).toEqual([{ line: 1, term: "A: b", definition: "c" }]);
    expect(parseCards("Ratio: 1 part - 2 parts").items).toEqual([
      { line: 1, term: "Ratio: 1 part", definition: "2 parts" },
    ]);
  });
});
