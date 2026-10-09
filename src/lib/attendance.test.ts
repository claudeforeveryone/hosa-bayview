import { describe, expect, it } from "vitest";
import {
  addDays,
  attendanceRate,
  compareParticipation,
  countStatuses,
  fetchAllPages,
  flagFor,
  isIsoDate,
  isStatus,
  isWeekStart,
  nextStatus,
  recentWeeks,
  summarizeMembers,
  torontoToday,
  weekLabel,
  weekStartOf,
  type Status,
} from "./attendance";

describe("nextStatus", () => {
  it("cycles unmarked, present, late, absent, excused, then back to unmarked", () => {
    const seen: (Status | null)[] = [null];
    for (let i = 0; i < 5; i++) seen.push(nextStatus(seen[seen.length - 1]));
    expect(seen).toEqual([null, "present", "late", "absent", "excused", null]);
  });
});

describe("isStatus", () => {
  it("accepts only the four statuses", () => {
    expect(isStatus("late")).toBe(true);
    expect(isStatus("tardy")).toBe(false);
    expect(isStatus(null)).toBe(false);
  });
});

describe("attendanceRate", () => {
  it("counts late as attended and leaves excused out", () => {
    const c = countStatuses([
      "present",
      "late",
      "absent",
      "excused",
      "excused",
    ]);
    expect(attendanceRate(c)).toEqual({ attended: 2, counted: 3, rate: 67 });
  });

  it("has no rate when nothing counts", () => {
    expect(attendanceRate(countStatuses(["excused"]))).toEqual({
      attended: 0,
      counted: 0,
      rate: null,
    });
    expect(attendanceRate(countStatuses([])).rate).toBeNull();
  });
});

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects impossible or malformed dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-5")).toBe(false);
    expect(isIsoDate("tomorrow")).toBe(false);
  });
});

describe("torontoToday", () => {
  it("uses the Toronto calendar day, not UTC", () => {
    // 02:30 UTC on Oct 9 is still Oct 8 evening in Toronto (EDT, UTC-4).
    expect(torontoToday(new Date("2026-10-09T02:30:00Z"))).toBe("2026-10-08");
  });
});

describe("fetchAllPages", () => {
  // Fake PostgREST: serves rows in slices and records each requested range.
  const serve =
    (rows: number[], calls: [number, number][] = []) =>
    (from: number, to: number) => {
      calls.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    };

  it("reads past the 1000-row cap until a short page", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    const calls: [number, number][] = [];
    const all = await fetchAllPages(serve(rows, calls));
    expect(all).toHaveLength(2500);
    expect(all[2499]).toBe(2499);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after one request when the first page is short", async () => {
    const calls: [number, number][] = [];
    expect(await fetchAllPages(serve([1, 2, 3], calls))).toEqual([1, 2, 3]);
    expect(calls).toEqual([[0, 999]]);
  });

  it("does not ask again when the rows land exactly on a page boundary and the next page is empty", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i);
    const calls: [number, number][] = [];
    expect(await fetchAllPages(serve(rows, calls))).toHaveLength(1000);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("throws the database message on error", async () => {
    await expect(
      fetchAllPages(() =>
        Promise.resolve({ data: null, error: { message: "boom" } }),
      ),
    ).rejects.toThrow("boom");
  });
});

describe("week helpers", () => {
  it("names a week by its Monday", () => {
    expect(weekStartOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(weekStartOf("2026-10-07")).toBe("2026-10-05"); // Wednesday
    expect(weekStartOf("2026-10-11")).toBe("2026-10-05"); // Sunday closes the Monday week
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12"); // next Monday
  });

  it("crosses month and year boundaries", () => {
    expect(weekStartOf("2026-01-01")).toBe("2025-12-29"); // Thursday
    expect(weekStartOf("2026-03-01")).toBe("2026-02-23"); // Sunday
  });

  it("only Mondays are week starts", () => {
    expect(isWeekStart("2026-10-05")).toBe(true);
    expect(isWeekStart("2026-10-06")).toBe(false);
    expect(isWeekStart("2026-02-30")).toBe(false);
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -7)).toBe("2026-02-22");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("lists recent weeks newest first and stops at the floor", () => {
    expect(recentWeeks("2026-10-05", 3)).toEqual([
      "2026-10-05",
      "2026-09-28",
      "2026-09-21",
    ]);
    expect(recentWeeks("2026-10-05", 8, "2026-09-21")).toEqual([
      "2026-10-05",
      "2026-09-28",
      "2026-09-21",
    ]);
    expect(recentWeeks("2026-10-05", 8, "2026-10-20")).toEqual([]);
  });

  it("labels a week with its Monday", () => {
    expect(weekLabel("2026-10-05")).toBe("Meeting Thu Oct 8");
  });
});

describe("participation", () => {
  it("counts late as attended, absent as counted, excused as neither", () => {
    const rows = summarizeMembers([
      { user_id: "u1", status: "present" },
      { user_id: "u1", status: "late" },
      { user_id: "u1", status: "absent" },
      { user_id: "u1", status: "excused" },
    ]);
    expect(rows).toEqual([
      {
        user_id: "u1",
        counts: { present: 1, late: 1, absent: 1, excused: 1 },
        attended: 2,
        counted: 3,
        rate: 67,
        flag: null,
      },
    ]);
  });

  it("gives each member one row across classrooms", () => {
    const rows = summarizeMembers([
      { user_id: "u1", status: "present" },
      { user_id: "u2", status: "absent" },
      { user_id: "u1", status: "late" },
    ]);
    expect(rows.map((r) => r.user_id).sort()).toEqual(["u1", "u2"]);
    expect(rows.find((r) => r.user_id === "u1")).toMatchObject({
      attended: 2,
      counted: 2,
      rate: 100,
    });
    expect(rows.find((r) => r.user_id === "u2")).toMatchObject({
      attended: 0,
      counted: 1,
      rate: 0,
    });
  });

  it("flags perfect attendance only with at least four counted weeks", () => {
    expect(flagFor(3, 3)).toBeNull();
    expect(flagFor(4, 4)).toBe("perfect");
    expect(flagFor(0, 3)).toBeNull();
  });

  it("flags a check-in only below half, with at least four counted weeks", () => {
    expect(flagFor(1, 4)).toBe("check-in");
    expect(flagFor(2, 4)).toBeNull(); // exactly 50% is not below half
    expect(flagFor(1, 3)).toBeNull();
  });

  it("has no flag and no rate for someone with only excused weeks", () => {
    expect(
      summarizeMembers([{ user_id: "u1", status: "excused" }])[0],
    ).toMatchObject({
      rate: null,
      flag: null,
    });
  });

  it("orders the lowest rates first, unrated last, then by name", () => {
    const rows = [
      { name: "Zed", rate: 80 as number | null, counted: 5 },
      { name: "Amy", rate: null as number | null, counted: 0 },
      { name: "Bo", rate: 40 as number | null, counted: 4 },
      { name: "Cy", rate: 80 as number | null, counted: 9 },
      { name: "Al", rate: 80 as number | null, counted: 5 },
    ];
    expect(rows.sort(compareParticipation).map((r) => r.name)).toEqual([
      "Bo",
      "Cy",
      "Al",
      "Zed",
      "Amy",
    ]);
  });
});
