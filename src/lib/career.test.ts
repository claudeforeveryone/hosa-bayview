import { describe, expect, it } from "vitest";
import {
  careerCounts,
  dayLabel,
  filterEntries,
  groupByDay,
  parseCareerFilter,
  parseCareerSort,
  sortEntries,
} from "./career";

const rows = [
  { answered_at: "2026-10-10T15:00:00Z", is_correct: true, question_id: "q1" },
  { answered_at: "2026-10-10T13:00:00Z", is_correct: false, question_id: "q2" },
  { answered_at: "2026-10-09T15:00:00Z", is_correct: false, question_id: "q1" },
  { answered_at: "2026-10-06T15:00:00Z", is_correct: null, question_id: null },
];
const favs = new Set(["q1"]);

describe("parse", () => {
  it("accepts known values and falls back", () => {
    expect(parseCareerFilter("favorites")).toBe("favorites");
    expect(parseCareerFilter("wrong")).toBe("wrong");
    expect(parseCareerFilter("nope")).toBe("all");
    expect(parseCareerFilter(["right"])).toBe("all");
    expect(parseCareerSort("oldest")).toBe("oldest");
    expect(parseCareerSort(undefined)).toBe("newest");
  });
});

describe("filterEntries", () => {
  it("filters by verdict and favourites", () => {
    expect(filterEntries(rows, "all", favs)).toHaveLength(4);
    expect(filterEntries(rows, "right", favs)).toHaveLength(1);
    expect(filterEntries(rows, "wrong", favs)).toHaveLength(2);
    expect(filterEntries(rows, "favorites", favs).map((r) => r.answered_at)).toEqual([
      "2026-10-10T15:00:00Z",
      "2026-10-09T15:00:00Z",
    ]);
  });

  it("counts each filter", () => {
    expect(careerCounts(rows, favs)).toEqual({ all: 4, right: 1, wrong: 2, favorites: 2 });
  });
});

describe("sortEntries", () => {
  it("sorts newest or oldest first without changing the input", () => {
    const oldest = sortEntries(rows, "oldest");
    expect(oldest[0].answered_at).toBe("2026-10-06T15:00:00Z");
    expect(sortEntries(oldest, "newest")[0].answered_at).toBe("2026-10-10T15:00:00Z");
    expect(rows[0].answered_at).toBe("2026-10-10T15:00:00Z");
  });
});

describe("dayLabel", () => {
  it("names today, yesterday and other days", () => {
    expect(dayLabel("2026-10-10", "2026-10-10")).toBe("Today");
    expect(dayLabel("2026-10-09", "2026-10-10")).toBe("Yesterday");
    expect(dayLabel("2026-10-06", "2026-10-10")).toBe("Tue Oct 6");
    expect(dayLabel("2025-12-31", "2026-01-01")).toBe("Yesterday");
    expect(dayLabel("2025-10-06", "2026-10-10")).toBe("Mon Oct 6, 2025");
  });
});

describe("groupByDay", () => {
  it("groups consecutive rows by Toronto day", () => {
    const groups = groupByDay(rows, new Date("2026-10-10T16:00:00Z"));
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Tue Oct 6", 1],
    ]);
  });

  it("uses Toronto time, not UTC", () => {
    // 02:00 UTC on Oct 11 is still Oct 10 in Toronto.
    const groups = groupByDay(
      [{ answered_at: "2026-10-11T02:00:00Z", is_correct: true, question_id: "q" }],
      new Date("2026-10-11T03:00:00Z"),
    );
    expect(groups[0].label).toBe("Today");
    expect(groups[0].key).toBe("2026-10-10");
  });
});
