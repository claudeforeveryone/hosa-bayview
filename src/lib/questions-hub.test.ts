import { describe, expect, it } from "vitest";
import { minutesLeft, orderRooms, unfinished } from "./questions-hub";

const NOW = Date.parse("2026-10-12T15:00:00Z");
const a = (id: string, test: string, extra: Partial<Parameters<typeof unfinished>[0][number]> = {}) => ({
  id,
  test_id: test,
  mode: "practice",
  started_at: "2026-10-12T14:00:00Z",
  deadline: null,
  submitted_at: null,
  ...extra,
});

describe("unfinished", () => {
  it("keeps open runs on known tests, newest first", () => {
    const rows = [
      a("1", "t1", { started_at: "2026-10-12T10:00:00Z" }),
      a("2", "t2", { started_at: "2026-10-12T12:00:00Z" }),
      a("3", "t3"),
      a("4", "t1", { submitted_at: "2026-10-12T11:00:00Z" }),
    ];
    expect(unfinished(rows, new Set(["t1", "t2"]), NOW).map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("drops timed runs whose clock ran out", () => {
    const rows = [
      a("live", "t1", { mode: "timed", deadline: "2026-10-12T15:10:00Z" }),
      a("over", "t2", { mode: "timed", deadline: "2026-10-12T14:59:00Z" }),
    ];
    expect(unfinished(rows, new Set(["t1", "t2"]), NOW).map((r) => r.id)).toEqual(["live"]);
  });

  it("shows one run per test and mode", () => {
    const rows = [
      a("old", "t1", { started_at: "2026-10-11T10:00:00Z" }),
      a("new", "t1"),
      a("timed", "t1", { mode: "timed", deadline: "2026-10-12T16:00:00Z" }),
    ];
    expect(unfinished(rows, new Set(["t1"]), NOW).map((r) => r.id)).toEqual(["new", "timed"]);
  });
});

describe("orderRooms", () => {
  it("puts recently visited rooms first, then A to Z", () => {
    const rooms = [
      { id: "a", name: "Pharmacology" },
      { id: "b", name: "Medical Terminology" },
      { id: "c", name: "Anatomy" },
    ];
    expect(orderRooms(rooms, ["a"]).map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(orderRooms(rooms, []).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("minutesLeft", () => {
  it("rounds up and never goes below zero", () => {
    expect(minutesLeft(null, NOW)).toBeNull();
    expect(minutesLeft("2026-10-12T15:00:30Z", NOW)).toBe(1);
    expect(minutesLeft("2026-10-12T14:00:00Z", NOW)).toBe(0);
  });
});
