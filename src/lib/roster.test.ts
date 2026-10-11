import { describe, expect, it } from "vitest";
import {
  classLabel,
  columnTotal,
  currentWeekIndex,
  markKey,
  normalizeName,
  normalizeShortCode,
  pickWeekIndex,
  presentKeys,
  rowTotal,
  weekColumnLabel,
  weekLongLabel,
} from "./roster";

const weeks = [
  { id: "w1", meet_on: "2030-10-17" },
  { id: "w2", meet_on: "2030-10-24" },
  { id: "w3", meet_on: "2030-11-07" },
];

describe("week labels", () => {
  it("shows month and day", () => {
    expect(weekColumnLabel("2030-10-17")).toBe("Oct 17");
    expect(weekColumnLabel("2031-01-02")).toBe("Jan 2");
  });
  it("adds the weekday for the picker", () => {
    expect(weekLongLabel("2030-10-17")).toBe("Thu Oct 17");
  });
});

describe("currentWeekIndex", () => {
  it("is today's meeting on the day", () => {
    expect(currentWeekIndex(weeks, "2030-10-24")).toBe(1);
  });
  it("is the next meeting between meetings", () => {
    expect(currentWeekIndex(weeks, "2030-10-25")).toBe(2);
    expect(currentWeekIndex(weeks, "2030-01-01")).toBe(0);
  });
  it("is the last meeting once the season is over", () => {
    expect(currentWeekIndex(weeks, "2031-06-01")).toBe(2);
  });
  it("is -1 with no meetings", () => {
    expect(currentWeekIndex([], "2030-10-24")).toBe(-1);
  });
});

describe("pickWeekIndex", () => {
  it("uses the asked-for date when it is a meeting", () => {
    expect(pickWeekIndex(weeks, "2030-10-17", "2030-11-07")).toBe(0);
  });
  it("falls back to the current week otherwise", () => {
    expect(pickWeekIndex(weeks, "2030-10-18", "2030-10-20")).toBe(1);
    expect(pickWeekIndex(weeks, undefined, "2030-10-20")).toBe(1);
  });
});

describe("totals", () => {
  const present = presentKeys([
    { member_id: "a", week_id: "w1", present: true },
    { member_id: "a", week_id: "w2", present: true },
    { member_id: "a", week_id: "w3", present: false },
    { member_id: "b", week_id: "w2", present: true },
  ]);
  it("skips unticked marks", () => {
    expect(present.has(markKey("a", "w3"))).toBe(false);
    expect(present.size).toBe(3);
  });
  it("counts a row", () => {
    expect(rowTotal(present, "a", ["w1", "w2", "w3"])).toBe(2);
    expect(rowTotal(present, "c", ["w1", "w2", "w3"])).toBe(0);
  });
  it("counts a column", () => {
    expect(columnTotal(present, ["a", "b", "c"], "w2")).toBe(2);
    expect(columnTotal(present, ["a", "b", "c"], "w3")).toBe(0);
  });
});

describe("labels and input", () => {
  it("puts the short code first", () => {
    expect(classLabel("ZZ", "Zebra Studies")).toBe("ZZ · Zebra Studies");
    expect(classLabel(null, "Zebra Studies")).toBe("Zebra Studies");
  });
  it("normalizes short codes", () => {
    expect(normalizeShortCode(" zz ")).toBe("ZZ");
    expect(normalizeShortCode("abcd")).toBe("ABCD");
    expect(normalizeShortCode("")).toBe("");
    expect(normalizeShortCode("A")).toBeNull();
    expect(normalizeShortCode("ABCDE")).toBeNull();
    expect(normalizeShortCode("A1")).toBeNull();
  });
  it("tidies names", () => {
    expect(normalizeName("  Pat   Example ")).toBe("Pat Example");
  });
});
