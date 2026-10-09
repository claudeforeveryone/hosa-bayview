import { describe, expect, it } from "vitest";
import {
  competitionState,
  groupByTest,
  myTestStatus,
  orderCompetitions,
  percentOf,
  progressLine,
  stateLabel,
  windowLine,
} from "./competitions";

const T = (iso: string) => Date.parse(iso);

describe("competitionState", () => {
  const window = {
    opens: "2026-10-14T22:30:00.000Z",
    closes: "2026-10-15T00:30:00.000Z",
  };

  it("is upcoming before the opening time", () => {
    expect(
      competitionState(
        window.opens,
        window.closes,
        T("2026-10-14T20:00:00.000Z"),
      ),
    ).toBe("upcoming");
  });
  it("is open between the two times", () => {
    expect(
      competitionState(
        window.opens,
        window.closes,
        T("2026-10-14T23:00:00.000Z"),
      ),
    ).toBe("open");
  });
  it("is closed from the closing time on", () => {
    expect(
      competitionState(
        window.opens,
        window.closes,
        T("2026-10-15T00:30:00.000Z"),
      ),
    ).toBe("closed");
    expect(
      competitionState(
        window.opens,
        window.closes,
        T("2026-10-16T12:00:00.000Z"),
      ),
    ).toBe("closed");
  });
  it("is open with no window at all", () => {
    expect(competitionState(null, null, T("2030-01-01T00:00:00.000Z"))).toBe(
      "open",
    );
  });
  it("is open with only a closing time before it", () => {
    expect(
      competitionState(null, window.closes, T("2026-10-14T12:00:00.000Z")),
    ).toBe("open");
  });
  it("labels each state", () => {
    expect(stateLabel("upcoming")).toBe("Upcoming");
    expect(stateLabel("open")).toBe("Open now");
    expect(stateLabel("closed")).toBe("Closed");
  });
});

describe("orderCompetitions", () => {
  const row = (
    name: string,
    state: "upcoming" | "open" | "closed",
    opens_at: string | null,
  ) => ({
    name,
    state,
    opens_at,
  });

  it("lists open, then upcoming, then closed", () => {
    const out = orderCompetitions([
      row("closed", "closed", "2026-09-01T00:00:00.000Z"),
      row("upcoming", "upcoming", "2026-11-01T00:00:00.000Z"),
      row("open", "open", "2026-10-01T00:00:00.000Z"),
    ]).map((r) => r.name);
    expect(out).toEqual(["open", "upcoming", "closed"]);
  });

  it("puts the soonest upcoming first and the latest closed first", () => {
    const out = orderCompetitions([
      row("late upcoming", "upcoming", "2026-12-01T00:00:00.000Z"),
      row("soon upcoming", "upcoming", "2026-10-20T00:00:00.000Z"),
      row("old closed", "closed", "2026-01-01T00:00:00.000Z"),
      row("new closed", "closed", "2026-09-01T00:00:00.000Z"),
    ]).map((r) => r.name);
    expect(out).toEqual([
      "soon upcoming",
      "late upcoming",
      "new closed",
      "old closed",
    ]);
  });

  it("sinks competitions without a time to the end of their group", () => {
    const out = orderCompetitions([
      row("no time", "open", null),
      row("timed", "open", "2026-10-01T00:00:00.000Z"),
    ]).map((r) => r.name);
    expect(out).toEqual(["timed", "no time"]);
  });

  it("does not mutate its input", () => {
    const input = [row("b", "closed", null), row("a", "open", null)];
    orderCompetitions(input);
    expect(input[0].name).toBe("b");
  });
});

describe("windowLine", () => {
  it("shows both ends", () => {
    const line = windowLine(
      "2026-10-14T22:30:00.000Z",
      "2026-10-15T00:30:00.000Z",
    );
    expect(line).toMatch(/^Opens .+ · Closes .+$/);
  });
  it("shows one end when only one is set", () => {
    expect(windowLine("2026-10-14T22:30:00.000Z", null)).toMatch(
      /^Opens [^·]+$/,
    );
    expect(windowLine(null, "2026-10-15T00:30:00.000Z")).toMatch(
      /^Closes [^·]+$/,
    );
  });
  it("says so when there are no times", () => {
    expect(windowLine(null, null)).toBe("Open with no set times");
  });
});

describe("progressLine", () => {
  it("counts done tests while open", () => {
    expect(progressLine("open", 2, 5)).toBe("2 of 5 done");
  });
  it("says when there are no tests", () => {
    expect(progressLine("open", 0, 0)).toBe("No tests yet");
    expect(progressLine("closed", 0, 0)).toBe("No tests yet");
  });
  it("counts tests once closed and hides counts while upcoming", () => {
    expect(progressLine("closed", 0, 1)).toBe("1 test");
    expect(progressLine("closed", 0, 3)).toBe("3 tests");
    expect(progressLine("upcoming", 0, 3)).toBeNull();
  });
});

describe("percentOf and myTestStatus", () => {
  it("rounds to a whole percent and guards zero totals", () => {
    expect(percentOf(7, 9)).toBe(78);
    expect(percentOf(0, 0)).toBeNull();
  });
  it("reads open tests without giving away a score", () => {
    expect(
      myTestStatus({ state: "open", attempts: 1, best: 9, bestTotal: 10 }),
    ).toBe("Submitted");
    expect(
      myTestStatus({ state: "open", attempts: 0, best: null, bestTotal: null }),
    ).toBe("Not started");
  });
  it("shows score and percent once closed", () => {
    expect(
      myTestStatus({ state: "closed", attempts: 1, best: 7, bestTotal: 9 }),
    ).toBe("7/9 · 78%");
    expect(
      myTestStatus({
        state: "closed",
        attempts: 0,
        best: null,
        bestTotal: null,
      }),
    ).toBe("Not taken");
  });
  it("hides everything while upcoming", () => {
    expect(
      myTestStatus({
        state: "upcoming",
        attempts: 0,
        best: null,
        bestTotal: null,
      }),
    ).toBe("Not open yet");
  });
});

describe("groupByTest", () => {
  it("keeps each test's rows together in their original order", () => {
    const rows = [
      { test_id: "a", test_title: "Alpha", place: 1 },
      { test_id: "b", test_title: "Beta", place: 1 },
      { test_id: "a", test_title: "Alpha", place: 2 },
    ];
    const groups = groupByTest(rows);
    expect(groups.map((g) => g.title)).toEqual(["Alpha", "Beta"]);
    expect(groups[0].rows.map((r) => r.place)).toEqual([1, 2]);
    expect(groups[1].rows).toHaveLength(1);
  });
  it("returns nothing for no rows", () => {
    expect(groupByTest([])).toEqual([]);
  });
});
