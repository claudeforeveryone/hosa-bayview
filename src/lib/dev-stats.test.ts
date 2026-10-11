import { describe, expect, it } from "vitest";
import {
  accuracyOf,
  isDevSortKey,
  searchDevRows,
  sortDevRows,
  summarizeDev,
  summaryText,
  type DevStatsRow,
} from "./dev-stats";

const base: DevStatsRow = {
  user_id: "u0",
  full_name: "Base",
  role: "trainee",
  title: null,
  joined_at: "2026-09-01T12:00:00+00:00",
  banned: false,
  last_seen: null,
  seen_today: false,
  seen_week: false,
  minutes_all: 0,
  minutes_7d: 0,
  minutes_today: 0,
  minutes_period: 0,
  clicks_all: 0,
  clicks_7d: 0,
  clicks_today: 0,
  clicks_period: 0,
  answered: 0,
  correct: 0,
  attempts: 0,
  finished: 0,
  reviews: 0,
  battle_wins: 0,
  classrooms: 0,
  elo: 1200,
  elo_gain: 0,
};

const row = (
  id: string,
  name: string,
  patch: Partial<DevStatsRow> = {},
): DevStatsRow => ({
  ...base,
  user_id: id,
  full_name: name,
  ...patch,
});

describe("accuracyOf", () => {
  it("is correct over answered, and null with nothing answered", () => {
    expect(accuracyOf(3, 4)).toBe(0.75);
    expect(accuracyOf(0, 0)).toBeNull();
  });
});

describe("summarizeDev", () => {
  it("counts members and sums the period figures", () => {
    const rows = [
      row("a", "Ann", {
        seen_today: true,
        seen_week: true,
        minutes_period: 90,
        answered: 10,
        clicks_period: 40,
      }),
      row("b", "Ben", {
        seen_week: true,
        minutes_period: 30,
        answered: 5,
        clicks_period: 2,
      }),
      row("c", "Cy"),
    ];
    expect(summarizeDev(rows)).toEqual({
      members: 3,
      activeToday: 1,
      activeWeek: 2,
      minutesPeriod: 120,
      answeredPeriod: 15,
      clicksPeriod: 42,
    });
  });

  it("is all zeros for an empty chapter", () => {
    expect(summarizeDev([])).toEqual({
      members: 0,
      activeToday: 0,
      activeWeek: 0,
      minutesPeriod: 0,
      answeredPeriod: 0,
      clicksPeriod: 0,
    });
  });

  it("formats hours to one decimal and counts with separators", () => {
    const text = summaryText(
      summarizeDev([
        row("a", "Ann", {
          minutes_period: 90,
          answered: 1234,
          clicks_period: 5,
        }),
      ]),
    );
    expect(text.hours).toBe("1.5");
    expect(text.questions).toBe("1,234");
    expect(text.clicks).toBe("5");
  });
});

describe("sortDevRows", () => {
  const rows = [
    row("a", "Cara", {
      elo: 1300,
      clicks_all: 50,
      last_seen: "2026-10-09T10:00:00+00:00",
      answered: 4,
      correct: 1,
    }),
    row("b", "ann", {
      elo: 1500,
      clicks_all: 5,
      last_seen: null,
      answered: 0,
      correct: 0,
    }),
    row("c", "Bo", {
      elo: 1300,
      clicks_all: 500,
      last_seen: "2026-10-10T08:00:00+00:00",
      answered: 2,
      correct: 2,
    }),
  ];

  it("sorts numbers both ways", () => {
    expect(
      sortDevRows(rows, "clicks_all", "desc").map((r) => r.user_id),
    ).toEqual(["c", "a", "b"]);
    expect(
      sortDevRows(rows, "clicks_all", "asc").map((r) => r.user_id),
    ).toEqual(["b", "a", "c"]);
  });

  it("sorts names case-insensitively", () => {
    expect(sortDevRows(rows, "name", "asc").map((r) => r.full_name)).toEqual([
      "ann",
      "Bo",
      "Cara",
    ]);
  });

  it("keeps missing values last in either direction", () => {
    expect(
      sortDevRows(rows, "last_seen", "desc").map((r) => r.user_id),
    ).toEqual(["c", "a", "b"]);
    expect(sortDevRows(rows, "last_seen", "asc").map((r) => r.user_id)).toEqual(
      ["a", "c", "b"],
    );
    expect(sortDevRows(rows, "accuracy", "desc").map((r) => r.user_id)).toEqual(
      ["c", "a", "b"],
    );
  });

  it("breaks ties by name", () => {
    expect(sortDevRows(rows, "elo", "desc").map((r) => r.user_id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("does not reorder the input", () => {
    const before = rows.map((r) => r.user_id);
    sortDevRows(rows, "elo", "asc");
    expect(rows.map((r) => r.user_id)).toEqual(before);
  });
});

describe("searchDevRows and isDevSortKey", () => {
  const rows = [row("a", "Ann Lee"), row("b", "Ben Park")];

  it("searches names case-insensitively and keeps everyone for an empty query", () => {
    expect(searchDevRows(rows, " lee ").map((r) => r.user_id)).toEqual(["a"]);
    expect(searchDevRows(rows, "").length).toBe(2);
  });

  it("accepts only known sort keys", () => {
    expect(isDevSortKey("clicks_today")).toBe(true);
    expect(isDevSortKey("accuracy")).toBe(true);
    expect(isDevSortKey("password")).toBe(false);
    expect(isDevSortKey(undefined)).toBe(false);
  });
});
