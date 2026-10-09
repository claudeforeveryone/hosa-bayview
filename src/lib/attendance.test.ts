import { describe, expect, it } from "vitest";
import {
  attendanceRate,
  countStatuses,
  fetchAllPages,
  isIsoDate,
  isStatus,
  nextStatus,
  summarizeOverview,
  torontoToday,
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
    const c = countStatuses(["present", "late", "absent", "excused", "excused"]);
    expect(attendanceRate(c)).toEqual({ attended: 2, counted: 3, rate: 67 });
  });

  it("has no rate when nothing counts", () => {
    expect(attendanceRate(countStatuses(["excused"]))).toEqual({ attended: 0, counted: 0, rate: null });
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
  const serve = (rows: number[], calls: [number, number][] = []) =>
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
      fetchAllPages(() => Promise.resolve({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("boom");
  });
});

describe("summarizeOverview", () => {
  it("counts each session and each member across classrooms", () => {
    const sessions = [
      { id: "s1", held_on: "2026-01-05", classroom_name: "A" },
      { id: "s2", held_on: "2026-01-06", classroom_name: "B" },
      { id: "s3", held_on: "2026-01-07", classroom_name: "B" },
    ];
    const marks = [
      { session_id: "s1", user_id: "u1", status: "present" as const },
      { session_id: "s1", user_id: "u2", status: "absent" as const },
      { session_id: "s2", user_id: "u1", status: "late" as const },
    ];
    const { sessionRows, memberRows } = summarizeOverview(sessions, marks);

    expect(sessionRows.find((r) => r.id === "s1")).toMatchObject({ marked: 2, counts: { present: 1, absent: 1 } });
    expect(sessionRows.find((r) => r.id === "s3")).toMatchObject({ marked: 0 });

    const u1 = memberRows.find((m) => m.user_id === "u1");
    expect(u1).toMatchObject({ attended: 2, counted: 2, rate: 100 });
    const u2 = memberRows.find((m) => m.user_id === "u2");
    expect(u2).toMatchObject({ attended: 0, counted: 1, rate: 0 });
  });
});
