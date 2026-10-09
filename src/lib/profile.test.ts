import { describe, expect, it } from "vitest";
import { filterByGrade, gradeLabel, initials, parseGrade } from "./profile";

describe("parseGrade", () => {
  it("keeps grades 9 to 12, from numbers or form text", () => {
    expect(parseGrade(9)).toBe(9);
    expect(parseGrade("12")).toBe(12);
    expect(parseGrade(" 10 ")).toBe(10);
  });

  it("treats anything else as no grade", () => {
    expect(parseGrade("")).toBeNull();
    expect(parseGrade(null)).toBeNull();
    expect(parseGrade(8)).toBeNull();
    expect(parseGrade(13)).toBeNull();
    expect(parseGrade("eleven")).toBeNull();
    expect(parseGrade("10th")).toBeNull();
    expect(parseGrade(["10"])).toBeNull();
  });

  it("labels grades", () => {
    expect(gradeLabel(11)).toBe("Grade 11");
    expect(gradeLabel(null)).toBe("No grade");
  });
});

describe("initials", () => {
  it("uses the first letter of the first and last names", () => {
    expect(initials("Joseph Leung")).toBe("JL");
    expect(initials("  kaden   li  ")).toBe("KL");
    expect(initials("Bernice Mary Au")).toBe("BA");
  });

  it("uses one letter for a single name, and ? for nothing", () => {
    expect(initials("Jenna")).toBe("J");
    expect(initials("   ")).toBe("?");
    expect(initials("")).toBe("?");
  });

  it("takes whole characters, not UTF-16 halves", () => {
    expect(initials("Éloïse Ōkubo")).toBe("ÉŌ");
  });
});

describe("filterByGrade", () => {
  const rows = [
    { name: "a", grade: 9 },
    { name: "b", grade: 10 },
    { name: "c", grade: null },
  ];

  it("returns everyone with no grade picked", () => {
    expect(filterByGrade(rows, null)).toHaveLength(3);
  });

  it("returns only that grade", () => {
    expect(filterByGrade(rows, 10).map((r) => r.name)).toEqual(["b"]);
  });
});
