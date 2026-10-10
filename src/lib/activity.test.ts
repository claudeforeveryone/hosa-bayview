import { describe, expect, it } from "vitest";
import {
  METRICS,
  PERIODS,
  type BoardRow,
  awardFor,
  classroomIdFromPath,
  filterCareer,
  filterMembers,
  formatPercent,
  formatStreak,
  formatValue,
  metricLabel,
  metricValue,
  parseMetric,
  parsePeriod,
  parseResult,
  periodSince,
  periodStart,
  rankBoard,
} from "@/lib/activity";

const row = (over: Partial<BoardRow> & { full_name: string }): BoardRow => ({
  user_id: over.full_name,
  minutes: 0,
  reviews: 0,
  answered: 0,
  correct: 0,
  accuracy: null,
  elo: 1200,
  gain: 0,
  streak: 0,
  ...over,
});

describe("parsing search params", () => {
  it("falls back for anything unknown, including repeated params", () => {
    expect(parsePeriod("today")).toBe("today");
    expect(parsePeriod("month")).toBe("month");
    expect(parsePeriod("year")).toBe("all");
    expect(parsePeriod(["month", "all"])).toBe("all");
    expect(parsePeriod(undefined)).toBe("all");
    expect(parsePeriod("week")).toBe("week");
    expect(parseMetric("hours")).toBe("hours");
    expect(parseMetric("bogus")).toBe("elo");
    // Elo leads: it is the default and the first choice in the measure menu.
    expect(METRICS[0]).toBe("elo");
    expect(PERIODS[0]).toBe("all");
    expect(parseResult("wrong")).toBe("wrong");
    expect(parseResult(undefined)).toBe("all");
  });
});

describe("rankBoard", () => {
  it("lists people with no activity yet, after those with some", () => {
    const ranked = rankBoard(
      [row({ full_name: "Ana" }), row({ full_name: "Ben", minutes: 30 })],
      "hours",
      "all",
    );
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
      "all",
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
        row({
          full_name: "Hal",
          minutes: 10,
          answered: 4,
          correct: 2,
          accuracy: 0.5,
        }),
        row({
          full_name: "Ivy",
          minutes: 10,
          answered: 5,
          correct: 5,
          accuracy: 1,
        }),
      ],
      "accuracy",
      "all",
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
      "all",
    );
    expect(ranked.map((r) => r.full_name)).toEqual(["Abe", "Bea", "Zed"]);
  });

  it("ranks Elo by the period gain inside a period, and by total Elo for all time", () => {
    const people = [
      row({ full_name: "Big past", elo: 1500, gain: 0 }),
      row({ full_name: "Big today", elo: 1300, gain: 42 }),
      row({ full_name: "Small today", elo: 1250, gain: 10 }),
    ];
    expect(rankBoard(people, "elo", "today").map((r) => r.full_name)).toEqual([
      "Big today",
      "Small today",
      "Big past",
    ]);
    expect(rankBoard(people, "elo", "all").map((r) => r.full_name)).toEqual([
      "Big past",
      "Big today",
      "Small today",
    ]);
    expect(rankBoard(people, "elo", "today")[0].value).toBe(42);
  });
});

describe("formatting", () => {
  it("formats each metric for the board", () => {
    expect(formatValue(1.5, "hours")).toBe("1.5");
    expect(formatValue(0.8, "accuracy")).toBe("80%");
    expect(formatValue(null, "accuracy")).toBe("—");
    expect(formatValue(1234, "reviews")).toBe("1,234");
    expect(formatValue(1215, "elo")).toBe("1,215");
  });

  it("shows Elo gained in a period with a plus sign, and the total for all time", () => {
    expect(formatValue(42, "elo", "today")).toBe("+42");
    expect(formatValue(0, "elo", "week")).toBe("0");
    expect(formatValue(1215, "elo", "all")).toBe("1,215");
  });

  it("formats streaks and percentages", () => {
    expect(formatStreak(0)).toBe("None");
    expect(formatStreak(1)).toBe("1 day");
    expect(formatStreak(5)).toBe("5 days");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0.667)).toBe("67%");
  });

  it("gives honor roll streaks a text award at 7, 30 and 100 days only", () => {
    expect(awardFor(3)).toBeNull();
    expect(awardFor(6)).toBeNull();
    expect(awardFor(7)).toBe("7-day");
    expect(awardFor(29)).toBe("7-day");
    expect(awardFor(30)).toBe("30-day");
    expect(awardFor(100)).toBe("100-day");
    expect(awardFor(365)).toBe("100-day");
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

  it("starts today at the Toronto day", () => {
    expect(periodSince("today", thursday)).toBe("Thu 8 Oct");
    // Sun 4 Oct 22:00 in Toronto (already Mon 5 Oct in UTC): today is still Sun 4 Oct.
    expect(periodSince("today", new Date("2026-10-05T02:00:00Z"))).toBe(
      "Sun 4 Oct",
    );
  });

  it("uses the Toronto day, not UTC, at the boundary", () => {
    // Sun 4 Oct 22:00 in Toronto (already Mon 5 Oct in UTC), so the week still began Mon 28 Sep.
    expect(periodSince("week", new Date("2026-10-05T02:00:00Z"))).toBe(
      "Mon 28 Sep",
    );
    // Mon 5 Oct 23:00 in Toronto.
    expect(periodSince("week", new Date("2026-10-06T03:00:00Z"))).toBe(
      "Mon 5 Oct",
    );
    // Wed 30 Sep 23:00 in Toronto is still September.
    expect(periodSince("month", new Date("2026-10-01T03:00:00Z"))).toBe(
      "Tue 1 Sep",
    );
  });
});

describe("filters", () => {
  it("searches names without case or stray spaces, and empty means everyone", () => {
    const people = [{ full_name: "Joseph Leung" }, { full_name: "Kaden Li" }];
    expect(filterMembers(people, "  LEUNG ")).toEqual([
      { full_name: "Joseph Leung" },
    ]);
    expect(filterMembers(people, "")).toHaveLength(2);
    expect(filterMembers(people, "zzz")).toEqual([]);
  });

  it("filters career rows by result", () => {
    const rows = [
      { is_correct: true },
      { is_correct: false },
      { is_correct: true },
    ];
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

// Task 12 (Elo rebuild): the board helpers against the new numbers. The database sends all-time Elo (chapter) or
// all-time points (room) in elo, and what was earned inside the period in gain.
describe("metricValue", () => {
  const r = row({ full_name: "Mo", minutes: 90, elo: 1234, gain: 12, accuracy: 0.75 });

  it("shows all-time Elo for all time and the period gain otherwise", () => {
    expect(metricValue(r, "elo", "all")).toBe(1234);
    expect(metricValue(r, "elo", "today")).toBe(12);
    expect(metricValue(r, "elo", "week")).toBe(12);
    expect(metricValue(r, "elo", "month")).toBe(12);
  });

  it("turns minutes into hours and passes accuracy through, null included", () => {
    expect(metricValue(r, "hours", "all")).toBe(1.5);
    expect(metricValue(r, "accuracy", "all")).toBe(0.75);
    expect(metricValue(row({ full_name: "No" }), "accuracy", "all")).toBeNull();
  });
});

describe("rankBoard with Elo", () => {
  it("gives equal Elo a shared place, and the next place skips (1, 1, 3)", () => {
    const ranked = rankBoard(
      [
        row({ full_name: "Ann", elo: 1210 }),
        row({ full_name: "Bob", elo: 1250 }),
        row({ full_name: "Cat", elo: 1250 }),
      ],
      "elo",
      "all",
    );
    expect(ranked.map((x) => [x.full_name, x.place])).toEqual([
      ["Bob", 1],
      ["Cat", 1],
      ["Ann", 3],
    ]);
  });

  it("ranks people who earned nothing this period last, tied, with a place", () => {
    const ranked = rankBoard(
      [
        row({ full_name: "Old", elo: 1500, gain: 0 }),
        row({ full_name: "New", elo: 1205, gain: 5 }),
        row({ full_name: "Idle", elo: 1200, gain: 0 }),
      ],
      "elo",
      "week",
    );
    expect(ranked.map((x) => [x.full_name, x.place, x.value])).toEqual([
      ["New", 1, 5],
      ["Idle", 2, 0],
      ["Old", 2, 0],
    ]);
  });

  it("ranks room points the same way (no 1200 base on a room board)", () => {
    const ranked = rankBoard(
      [row({ full_name: "Rae", elo: 0 }), row({ full_name: "Sam", elo: 128 })],
      "elo",
      "all",
    );
    expect(ranked.map((x) => [x.full_name, x.value])).toEqual([
      ["Sam", 128],
      ["Rae", 0],
    ]);
  });
});

describe("formatValue for Elo and points", () => {
  it("adds a plus only to a positive period gain", () => {
    expect(formatValue(1234, "elo", "month")).toBe("+1,234");
    expect(formatValue(0, "elo", "today")).toBe("0");
    expect(formatValue(1200, "elo", "all")).toBe("1,200");
    expect(formatValue(128, "elo")).toBe("128");
  });
});

describe("metricLabel", () => {
  it("calls the score Elo on the chapter board and Points on a room board", () => {
    expect(metricLabel("elo")).toBe("Elo");
    expect(metricLabel("elo", "chapter")).toBe("Elo");
    expect(metricLabel("elo", "room")).toBe("Points");
  });

  it("leaves the other measures alone", () => {
    expect(metricLabel("answered", "room")).toBe("Questions");
    expect(metricLabel("hours", "room")).toBe("Hours");
    expect(metricLabel("reviews", "chapter")).toBe("Flashcards");
  });
});

describe("periodStart (Toronto calendar day, as a UTC date)", () => {
  it("is null for all time", () => {
    expect(periodStart("all", new Date("2026-10-08T15:00:00Z"))).toBeNull();
  });

  it("gives today, Monday and the 1st", () => {
    const thursday = new Date("2026-10-08T15:00:00Z");
    expect(periodStart("today", thursday)?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(periodStart("week", thursday)?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(periodStart("month", thursday)?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("treats Monday itself as the start of its week", () => {
    // Mon 5 Oct 2026, 09:00 in Toronto.
    expect(periodStart("week", new Date("2026-10-05T13:00:00Z"))?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("holds across the autumn clock change (Sun 1 Nov 2026)", () => {
    // 00:30 EDT on Sun 1 Nov, before clocks go back: still Sunday, week from Mon 26 Oct.
    const early = new Date("2026-11-01T04:30:00Z");
    expect(periodStart("today", early)?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(periodStart("week", early)?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(periodStart("month", early)?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    // 23:30 EST on Sun 1 Nov (already Mon 2 Nov in UTC): still Sunday in Toronto.
    expect(periodStart("today", new Date("2026-11-02T04:30:00Z"))?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("holds across the spring clock change (Sun 8 Mar 2026)", () => {
    // 01:30 EST on Sun 8 Mar, just before clocks go forward.
    const before = new Date("2026-03-08T06:30:00Z");
    expect(periodStart("today", before)?.toISOString()).toBe("2026-03-08T00:00:00.000Z");
    expect(periodStart("week", before)?.toISOString()).toBe("2026-03-02T00:00:00.000Z");
    // 03:30 EDT, just after.
    expect(periodStart("today", new Date("2026-03-08T07:30:00Z"))?.toISOString()).toBe("2026-03-08T00:00:00.000Z");
  });

  it("rolls the month over on the Toronto date, not the UTC date", () => {
    // 21:00 EDT on Wed 30 Sep is already 1 Oct in UTC.
    expect(periodStart("month", new Date("2026-10-01T01:00:00Z"))?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
