import { describe, expect, it } from "vitest";
import { dayKey, isoToToronto, timeAgo, torontoToIso } from "./when";

describe("torontoToIso", () => {
  it("reads summer time as UTC-4", () => {
    expect(torontoToIso("2026-07-01T18:30")).toBe("2026-07-01T22:30:00.000Z");
  });
  it("reads winter time as UTC-5", () => {
    expect(torontoToIso("2026-12-01T09:00")).toBe("2026-12-01T14:00:00.000Z");
  });
  it("handles the day after the clocks change", () => {
    expect(torontoToIso("2026-11-02T12:00")).toBe("2026-11-02T17:00:00.000Z");
  });
  it("refuses the hour skipped in spring", () => {
    expect(torontoToIso("2027-03-14T02:30")).toBeNull();
    expect(torontoToIso("2027-03-14T03:30")).toBe("2027-03-14T07:30:00.000Z");
  });
  it("rejects junk and impossible dates", () => {
    expect(torontoToIso("")).toBeNull();
    expect(torontoToIso("tomorrow")).toBeNull();
    expect(torontoToIso("2026-02-30T10:00")).toBeNull();
    expect(torontoToIso("2026-13-01T10:00")).toBeNull();
  });
});

describe("isoToToronto", () => {
  it("round-trips", () => {
    for (const local of [
      "2026-07-01T18:30",
      "2026-12-01T09:00",
      "2027-03-20T00:15",
    ])
      expect(isoToToronto(torontoToIso(local))).toBe(local);
  });
  it("is empty for nothing", () => {
    expect(isoToToronto(null)).toBe("");
    expect(isoToToronto("nope")).toBe("");
  });
});

describe("dayKey and timeAgo", () => {
  it("groups late-evening UTC times on the Toronto day", () => {
    expect(dayKey("2026-10-15T02:00:00.000Z")).toBe("2026-10-14");
  });
  it("counts back", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    expect(timeAgo("2026-10-09T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-09T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-10-09T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-07T12:00:00Z", now)).toBe("2d ago");
  });
});
