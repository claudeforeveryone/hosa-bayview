import { describe, expect, it } from "vitest";
import {
  type BoardRow,
  classroomIdFromPath,
  filterCareer,
  filterMembers,
  formatPercent,
  formatStreak,
  formatValue,
  parseMetric,
  parsePeriod,
  parseResult,
  periodSince,
  rankBoard,
} from "@/lib/activity";

const row = (over: Partial<BoardRow> & { full_name: string }): BoardRow => ({
  user_id: over.full_name,
  minutes: 0,
  reviews: 0,
  answered: 0,
  correct: 0,
  accuracy: null,
  elo: 100,
  streak: 0,
  ...over,
});

describe("parsing search params", () => {
  it("falls back for anything unknown, including repeated params", () => {
    expect(parsePeriod("month")).toBe("month");
    expect(parsePeriod("year")).toBe("week");
    expect(parsePeriod(["month", "all"])).toBe("week");
    expect(parsePeriod(undefined)).toBe("week");
    expect(parseMetric("elo")).toBe("elo");
    expect(parseMetric("bogus")).toBe("hours");
    expect(parseResult("wrong")).toBe("wrong");
    expect(parseResult(undefined)).toBe("all");
  });
});

describe("rankBoard", () => {
  it("lists people with no activity yet, after those with some", () => {
    const ranked = rankBoard([row({ full_name: "Ana" }), row({ full_name: "Ben", minutes: 30 })], "hours");
    expect(ranked.map((r) => r.full_name)).toEqual(["Ben", "Ana"]);
  });

  it("sorts the chosen metric highest first and gives ties a shared place", () => {
    const ranked = rankBoard(
      [
        row({ full_name: "Cy", minutes: 60 }),
        row({ full_name: "Di", minutes: 120 }),
        row({ full_name: "Ed", minutes: 60 }),
        row({ full_name: "Fa", minutes: 30 }),
      ],
      "hours",
    );
    expect(ranked.map((r) => [r.full_name, r.place])).toEqual([
      ["Di", 1],
      ["Cy", 2],
      ["Ed", 2],
      ["Fa", 4],
    ]);
  });

  it("puts accuracy with no answers last and unplaced", () => {
    const ranked = rankBoard(
      [
        row({ full_name: "Gus", minutes: 10, answered: 0, accuracy: null }),
        row({ full_name: "Hal", minutes: 10, answered: 4, correct: 2, accuracy: 0.5 }),
        row({ full_name: "Ivy", minutes: 10, answered: 5, correct: 5, accuracy: 1 }),
      ],
      "accuracy",
    );
    expect(ranked.map((r) => [r.full_name, r.place])).toEqual([
      ["Ivy", 1],
      ["Hal", 2],
      ["Gus", null],
    ]);
  });

  it("breaks metric ties by questions answered, then name", () => {
    const ranked = rankBoard(
      [
        row({ full_name: "Zed", reviews: 10, answered: 1 }),
        row({ full_name: "Abe", reviews: 10, answered: 3 }),
        row({ full_name: "Bea", reviews: 10, answered: 1 }),
      ],
      "reviews",
    );
    expect(ranked.map((r) => r.full_name)).toEqual(["Abe", "Bea", "Zed"]);
  });
});

describe("formatting", () => {
  it("formats each metric for the board", () => {
    expect(formatValue(1.5, "hours")).toBe("1.5");
    expect(formatValue(0.8, "accuracy")).toBe("80%");
    expect(formatValue(null, "accuracy")).toBe("—");
    expect(formatValue(1234, "reviews")).toBe("1,234");
    expect(formatValue(115, "elo")).toBe("115");
  });

  it("formats streaks and percentages", () => {
    expect(formatStreak(0)).toBe("None");
    expect(formatStreak(1)).toBe("1 day");
    expect(formatStreak(5)).toBe("5 days");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0.667)).toBe("67%");
  });
});

describe("period math (Toronto time)", () => {
  // Thu 8 Oct 2026, 11:00 in Toronto.
  const thursday = new Date("2026-10-08T15:00:00Z");

  it("starts the week on Monday and the month on the 1st", () => {
    expect(periodSince("week", thursday)).toBe("Mon 5 Oct");
    expect(periodSince("month", thursday)).toBe("Thu 1 Oct");
    expect(periodSince("all", thursday)).toBeNull();
  });

  it("uses the Toronto day, not UTC, at the boundary", () => {
    // Sun 4 Oct 22:00 in Toronto (already Mon 5 Oct in UTC), so the week still began Mon 28 Sep.
    expect(periodSince("week", new Date("2026-10-05T02:00:00Z"))).toBe("Mon 28 Sep");
    // Mon 5 Oct 23:00 in Toronto.
    expect(periodSince("week", new Date("2026-10-06T03:00:00Z"))).toBe("Mon 5 Oct");
    // Wed 30 Sep 23:00 in Toronto is still September.
    expect(periodSince("month", new Date("2026-10-01T03:00:00Z"))).toBe("Tue 1 Sep");
  });
});

describe("filters", () => {
  it("searches names without case or stray spaces, and empty means everyone", () => {
    const people = [{ full_name: "Joseph Leung" }, { full_name: "Kaden Li" }];
    expect(filterMembers(people, "  LEUNG ")).toEqual([{ full_name: "Joseph Leung" }]);
    expect(filterMembers(people, "")).toHaveLength(2);
    expect(filterMembers(people, "zzz")).toEqual([]);
  });

  it("filters career rows by result", () => {
    const rows = [{ is_correct: true }, { is_correct: false }, { is_correct: true }];
    expect(filterCareer(rows, "right")).toHaveLength(2);
    expect(filterCareer(rows, "wrong")).toHaveLength(1);
    expect(filterCareer(rows, "all")).toHaveLength(3);
  });
});

describe("paths and presence", () => {
  const id = "3f2c1d1e-0000-4000-8000-000000000001";

  it("reads the classroom id only from classroom paths", () => {
    expect(classroomIdFromPath(`/c/${id}`)).toBe(id);
    expect(classroomIdFromPath(`/c/${id}/online`)).toBe(id);
    expect(classroomIdFromPath("/c/new")).toBeNull();
    expect(classroomIdFromPath("/leaderboard")).toBeNull();
    expect(classroomIdFromPath("/c/not-a-uuid")).toBeNull();
  });
});
