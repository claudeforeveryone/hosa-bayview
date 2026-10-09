import { describe, expect, it } from "vitest";
import {
  absenceLeaders,
  defaultAbsenceWarning,
  isCountedMeeting,
  meetingRows,
  meetingState,
  nextMeetingId,
  offSchedule,
  type Meeting,
} from "./meetings";

const TODAY = "2026-10-09";

const m = (
  meets_on: string,
  kind: Meeting["kind"] = "training",
  title = `Meet ${meets_on}`,
): Meeting => ({
  id: `id-${meets_on}`,
  meets_on,
  week_start: weekOf(meets_on),
  title,
  kind,
});

// The Monday of a Thursday is always three days earlier.
function weekOf(thursday: string): string {
  const d = new Date(`${thursday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 3);
  return d.toISOString().slice(0, 10);
}

describe("meetingState", () => {
  it("marks none-weeks as no meeting, whatever the session says", () => {
    expect(
      meetingState({ meets_on: "2026-10-01", kind: "none" }, true, TODAY),
    ).toBe("no-meeting");
    expect(
      meetingState({ meets_on: "2027-01-21", kind: "none" }, false, TODAY),
    ).toBe("no-meeting");
  });

  it("is taken when the classroom has a session, even on a future date", () => {
    expect(meetingState(m("2026-10-08"), true, TODAY)).toBe("taken");
    expect(meetingState(m("2026-10-15"), true, TODAY)).toBe("taken");
  });

  it("is upcoming, today, or not taken for a meeting without a session", () => {
    expect(meetingState(m("2026-10-15"), false, TODAY)).toBe("upcoming");
    expect(meetingState(m("2026-10-08"), false, TODAY)).toBe("not-taken");
    expect(meetingState(m("2026-10-09"), false, TODAY)).toBe("today");
  });
});

describe("isCountedMeeting", () => {
  it("counts real meetings that are before today only", () => {
    expect(isCountedMeeting(m("2026-10-08"), TODAY)).toBe(true);
    expect(isCountedMeeting(m("2026-10-09"), TODAY)).toBe(false);
    expect(isCountedMeeting(m("2026-10-15"), TODAY)).toBe(false);
  });

  it("never counts a none-week", () => {
    expect(
      isCountedMeeting({ meets_on: "2027-01-21", kind: "none" }, "2027-02-01"),
    ).toBe(false);
  });
});

describe("meetingRows", () => {
  it("sorts by date and attaches the session for each meeting's week", () => {
    const rows = meetingRows(
      [m("2026-10-22"), m("2026-10-15")],
      [{ session_id: "s1", week_start: weekOf("2026-10-15") }],
      TODAY,
    );
    expect(rows.map((r) => r.meets_on)).toEqual(["2026-10-15", "2026-10-22"]);
    expect(rows[0]).toMatchObject({ session_id: "s1", state: "taken" });
    expect(rows[1]).toMatchObject({ session_id: null, state: "upcoming" });
  });

  it("finds the next meeting that is today or to come", () => {
    const rows = meetingRows(
      [m("2026-10-08"), m("2026-10-15"), m("2026-10-22")],
      [],
      TODAY,
    );
    expect(nextMeetingId(rows)).toBe("id-2026-10-15");
    expect(nextMeetingId(meetingRows([m("2026-10-01")], [], TODAY))).toBeNull();
  });
});

describe("offSchedule", () => {
  it("returns sessions whose week has no meeting, newest first", () => {
    const meetings = [m("2026-10-15")];
    const sessions = [
      { session_id: "a", week_start: weekOf("2026-10-15") },
      { session_id: "b", week_start: "2026-10-05" },
      { session_id: "c", week_start: "2026-09-28" },
    ];
    expect(offSchedule(sessions, meetings).map((s) => s.session_id)).toEqual([
      "b",
      "c",
    ]);
  });
});

describe("absenceLeaders", () => {
  const meetings = [
    m("2026-10-01"), // past, counted
    m("2026-10-08"), // past, counted
    m("2026-10-15"), // future, not counted
    { ...m("2026-10-22", "none"), id: "none-week" }, // none, not counted
  ];
  const wk = (d: string) => weekOf(d);
  const sessions = [
    { session_id: "s1", week_start: wk("2026-10-01") },
    { session_id: "s2", week_start: wk("2026-10-08") },
    { session_id: "s3", week_start: wk("2026-10-15") },
    { session_id: "s4", week_start: wk("2026-10-22") },
  ];
  const marks = [
    { session_id: "s1", user_id: "ann", status: "absent" as const },
    { session_id: "s2", user_id: "ann", status: "absent" as const },
    { session_id: "s3", user_id: "ann", status: "absent" as const },
    { session_id: "s4", user_id: "ann", status: "absent" as const },
    { session_id: "s1", user_id: "bo", status: "absent" as const },
    { session_id: "s2", user_id: "bo", status: "excused" as const },
    { session_id: "s1", user_id: "cy", status: "present" as const },
    { session_id: "s2", user_id: "cy", status: "late" as const },
    { session_id: "s1", user_id: "dee", status: "absent" as const },
  ];
  const names = new Map([
    ["ann", "Ann Lee"],
    ["bo", "Bo Park"],
    ["cy", "Cy Ng"],
    ["dee", "Dee Ray"],
  ]);

  it("ranks by absences and counts only passed real meetings", () => {
    const rows = absenceLeaders({
      meetings,
      sessions,
      marks,
      names,
      today: TODAY,
    });
    expect(rows).toEqual([
      { user_id: "ann", name: "Ann Lee", absent: 2, counted: 2 },
      { user_id: "bo", name: "Bo Park", absent: 1, counted: 1 },
      { user_id: "dee", name: "Dee Ray", absent: 1, counted: 1 },
    ]);
  });

  it("leaves out excused marks and members with no absences", () => {
    const rows = absenceLeaders({
      meetings,
      sessions,
      marks,
      names,
      today: TODAY,
    });
    expect(rows.find((r) => r.user_id === "cy")).toBeUndefined();
    expect(rows.find((r) => r.user_id === "bo")?.counted).toBe(1);
  });

  it("names unknown members as former members", () => {
    const rows = absenceLeaders({
      meetings,
      sessions,
      marks: [{ session_id: "s1", user_id: "gone", status: "absent" }],
      names: new Map(),
      today: TODAY,
    });
    expect(rows).toEqual([
      { user_id: "gone", name: "Former member", absent: 1, counted: 1 },
    ]);
  });

  it("is empty when nothing has passed yet", () => {
    expect(
      absenceLeaders({ meetings, sessions, marks, names, today: "2026-10-01" }),
    ).toEqual([]);
  });
});

describe("defaultAbsenceWarning", () => {
  it("reads naturally for one and for several", () => {
    expect(defaultAbsenceWarning(1)).toContain("once");
    expect(defaultAbsenceWarning(3)).toContain("3 times");
    expect(defaultAbsenceWarning(3)).not.toContain("—");
  });
});
