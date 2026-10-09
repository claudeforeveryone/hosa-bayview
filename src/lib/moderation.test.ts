import { describe, expect, it } from "vitest";
import {
  addMonths,
  banStatus,
  banUntil,
  banWhen,
  torontoMidnight,
} from "./moderation";

const NOW = new Date("2026-10-08T15:00:00Z");

describe("banUntil", () => {
  it("adds a day and a week", () => {
    expect(banUntil("day", NOW)).toEqual(new Date("2026-10-09T15:00:00Z"));
    expect(banUntil("week", NOW)).toEqual(new Date("2026-10-15T15:00:00Z"));
  });

  it("adds a calendar month, clamped to the month's last day", () => {
    expect(banUntil("month", NOW)).toEqual(new Date("2026-11-08T15:00:00Z"));
    expect(addMonths(new Date("2026-01-31T12:00:00Z"), 1)).toEqual(
      new Date("2026-02-28T12:00:00Z"),
    );
  });

  it("is permanent when asked", () => {
    expect(banUntil("permanent", NOW)).toBe("permanent");
  });

  it("runs a custom date through the end of that Toronto day (EDT and EST)", () => {
    expect(banUntil("custom", NOW, "2026-10-20")).toEqual(
      new Date("2026-10-21T04:00:00Z"),
    );
    expect(banUntil("custom", NOW, "2027-01-10")).toEqual(
      new Date("2027-01-11T05:00:00Z"),
    );
  });

  it("refuses a custom date that is missing, malformed, or already over", () => {
    expect(banUntil("custom", NOW)).toBeNull();
    expect(banUntil("custom", NOW, "2026-02-30")).toBeNull();
    expect(banUntil("custom", NOW, "next tuesday")).toBeNull();
    expect(banUntil("custom", NOW, "2026-10-01")).toBeNull();
  });

  it("accepts today as a custom date (it lasts until midnight)", () => {
    expect(banUntil("custom", NOW, "2026-10-08")).toEqual(
      new Date("2026-10-09T04:00:00Z"),
    );
  });
});

describe("torontoMidnight", () => {
  it("is 04:00 UTC in summer and 05:00 UTC in winter", () => {
    expect(torontoMidnight("2026-07-01")).toEqual(
      new Date("2026-07-01T04:00:00Z"),
    );
    expect(torontoMidnight("2026-12-01")).toEqual(
      new Date("2026-12-01T05:00:00Z"),
    );
  });
});

describe("banStatus", () => {
  it("is not banned with no ban, or one that has run out", () => {
    expect(banStatus(null, NOW)).toEqual({ banned: false });
    expect(banStatus("2026-10-08T14:00:00Z", NOW)).toEqual({ banned: false });
    expect(banStatus("not a date", NOW)).toEqual({ banned: false });
  });

  it("is banned until a future time", () => {
    const status = banStatus("2026-10-09T15:00:00Z", NOW);
    expect(status).toEqual({
      banned: true,
      permanent: false,
      until: new Date("2026-10-09T15:00:00Z"),
    });
  });

  it("reads infinity as permanent", () => {
    expect(banStatus("infinity", NOW)).toEqual({
      banned: true,
      permanent: true,
      until: null,
    });
  });
});

describe("banWhen", () => {
  it("says permanently, or the Toronto date", () => {
    expect(banWhen({ permanent: true, until: null })).toBe("permanently");
    const text = banWhen({
      permanent: false,
      until: new Date("2026-10-21T04:00:00Z"),
    });
    expect(text).toMatch(/^until Oct 2[01], 2026$/);
  });
});
