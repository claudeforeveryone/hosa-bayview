import { describe, expect, it } from "vitest";
import {
  addDays,
  bucketByDay,
  eventDayKeys,
  gridDays,
  gridRange,
  groupByStartDay,
  monthLabel,
  monthParam,
  parseMonth,
  pickView,
  shiftMonth,
} from "./calendar-grid";
import { torontoToIso } from "./when";

const at = (local: string) => torontoToIso(local)!;

describe("month param", () => {
  it("reads YYYY-MM and falls back to today's month for anything else", () => {
    expect(parseMonth("2026-03", "2026-10-10")).toEqual({ year: 2026, month: 3 });
    for (const bad of [undefined, "", "2026-13", "2026-00", "26-03", "2026-3", "1999-05", "abcd-ef", "2026-03-01"])
      expect(parseMonth(bad, "2026-10-10")).toEqual({ year: 2026, month: 10 });
    expect(parseMonth(["2027-01", "x"], "2026-10-10")).toEqual({ year: 2027, month: 1 });
  });

  it("steps across year ends and formats back", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthParam({ year: 2027, month: 1 })).toBe("2027-01");
    expect(monthLabel({ year: 2026, month: 10 })).toMatch(/October.*2026/);
  });
});

describe("grid", () => {
  it("covers whole Sunday-first weeks around the month", () => {
    const days = gridDays({ year: 2026, month: 10 }); // Oct 1 2026 is a Thursday
    expect(days.length % 7).toBe(0);
    expect(days[0]).toMatchObject({ key: "2026-09-27", inMonth: false, weekday: 0 });
    expect(days.find((d) => d.key === "2026-10-01")).toMatchObject({ weekday: 4, inMonth: true });
    expect(days.at(-1)).toMatchObject({ key: "2026-10-31", inMonth: true, weekday: 6 }); // exactly five rows
    expect(gridDays({ year: 2026, month: 8 })).toHaveLength(42); // Aug 2026 needs six
    expect(days.filter((d) => d.inMonth)).toHaveLength(31);
  });

  it("handles February in leap and common years", () => {
    expect(gridDays({ year: 2028, month: 2 }).filter((d) => d.inMonth)).toHaveLength(29);
    // Feb 2026 starts on a Sunday and has 28 days: exactly four rows.
    expect(gridDays({ year: 2026, month: 2 })).toHaveLength(28);
  });

  it("spans Toronto midnights, across a DST change", () => {
    const nov = gridRange(gridDays({ year: 2026, month: 11 })); // clocks fall back Nov 1
    expect(nov.from).toBe("2026-11-01T04:00:00.000Z"); // still EDT at midnight
    expect(nov.to).toBe("2026-12-06T05:00:00.000Z"); // EST
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08"); // spring forward day
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("which days an event lands on", () => {
  it("a timed event sits on its Toronto day, even late in the evening", () => {
    // 11:30 p.m. Toronto is already the next day in UTC.
    expect(eventDayKeys({ starts_at: at("2026-11-01T23:30"), ends_at: null, all_day: false })).toEqual(["2026-11-01"]);
  });

  it("multi-day and all-day events cover every day, ends inclusive", () => {
    expect(
      eventDayKeys({ starts_at: at("2026-10-30T00:00"), ends_at: at("2026-11-02T00:00"), all_day: true }),
    ).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(
      eventDayKeys({ starts_at: at("2026-03-07T20:00"), ends_at: at("2026-03-08T10:00"), all_day: false }),
    ).toEqual(["2026-03-07", "2026-03-08"]);
  });

  it("a timed event ending at midnight doesn't spill into the next day; bad ends are ignored", () => {
    expect(
      eventDayKeys({ starts_at: at("2026-10-14T18:00"), ends_at: at("2026-10-15T00:00"), all_day: false }),
    ).toEqual(["2026-10-14"]);
    expect(
      eventDayKeys({ starts_at: at("2026-10-14T18:00"), ends_at: at("2026-10-13T18:00"), all_day: false }),
    ).toEqual(["2026-10-14"]);
    expect(
      eventDayKeys({ starts_at: at("2026-01-01T00:00"), ends_at: at("2027-01-01T00:00"), all_day: true }),
    ).toHaveLength(62);
  });

  it("buckets only grid days, all-day first then by time", () => {
    const days = gridDays({ year: 2026, month: 10 });
    const late = { id: "late", starts_at: at("2026-10-14T18:00"), ends_at: null, all_day: false };
    const early = { id: "early", starts_at: at("2026-10-14T09:00"), ends_at: null, all_day: false };
    const allDay = { id: "all", starts_at: at("2026-10-14T00:00"), ends_at: null, all_day: true };
    const outside = { id: "out", starts_at: at("2026-12-25T09:00"), ends_at: null, all_day: false };
    const span = { id: "span", starts_at: at("2026-10-29T00:00"), ends_at: at("2026-11-03T00:00"), all_day: true };
    const b = bucketByDay([late, outside, early, allDay, span], days);
    expect(b["2026-10-14"].map((e) => e.id)).toEqual(["all", "early", "late"]);
    expect(Object.values(b).flat().some((e) => e.id === "out")).toBe(false);
    expect(b["2026-10-31"].map((e) => e.id)).toEqual(["span"]); // last grid day
    expect(b["2026-11-01"]).toBeUndefined();
  });
});

describe("calendar view", () => {
  it("an explicit view wins, then a month link, then the remembered choice", () => {
    expect(pickView("list", "2026-10", "month")).toBe("list");
    expect(pickView("month", undefined, "list")).toBe("month");
    expect(pickView(undefined, "2026-10", "list")).toBe("month");
    expect(pickView(undefined, undefined, "list")).toBe("list");
    expect(pickView(undefined, undefined, undefined)).toBe("month");
    expect(pickView("weird", undefined, "nonsense")).toBe("month");
    expect(pickView(["list", "month"], undefined, undefined)).toBe("list");
  });
});

describe("agenda days", () => {
  it("groups by the Toronto start day, in order", () => {
    const rows = [
      { id: "a", starts_at: at("2026-10-14T09:00") },
      { id: "b", starts_at: at("2026-10-14T23:30") },
      { id: "c", starts_at: at("2026-10-15T00:30") },
    ];
    const days = groupByStartDay(rows);
    expect(days.map((d) => d.key)).toEqual(["2026-10-14", "2026-10-15"]);
    expect(days[0].items.map((e) => e.id)).toEqual(["a", "b"]);
    expect(groupByStartDay([])).toEqual([]);
  });
});
