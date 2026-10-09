// Pure helpers for the chapter meeting schedule and absence counts. Safe on client and server.
// A meeting is one Thursday. Attendance is still one session per classroom per Monday-start week, so a
// meeting finds its session through week_start. "none" weeks are listed but never taken or counted.
import type { Status } from "@/lib/attendance";

export const MEETING_KINDS = ["training", "social", "exam", "none"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export type Meeting = {
  id: string;
  meets_on: string; // YYYY-MM-DD, a Thursday
  week_start: string; // the Monday of that week
  title: string;
  kind: MeetingKind;
};

export const KIND_LABEL: Record<MeetingKind, string> = {
  training: "Training",
  social: "Social",
  exam: "Exam",
  none: "No meeting",
};

export type SessionLite = { session_id: string; week_start: string };
export type MarkLite = { session_id: string; user_id: string; status: Status };

export type MeetingState =
  "no-meeting" | "upcoming" | "today" | "taken" | "not-taken";

export const STATE_LABEL: Record<MeetingState, string> = {
  "no-meeting": "No meeting",
  upcoming: "Coming up",
  today: "Today, not taken yet",
  taken: "Taken",
  "not-taken": "Not taken",
};

// Where a meeting stands on `today` (YYYY-MM-DD, Toronto). String order is date order for ISO dates.
export function meetingState(
  m: Pick<Meeting, "meets_on" | "kind">,
  hasSession: boolean,
  today: string,
): MeetingState {
  if (m.kind === "none") return "no-meeting";
  if (hasSession) return "taken";
  if (m.meets_on > today) return "upcoming";
  if (m.meets_on === today) return "today";
  return "not-taken";
}

// A real meeting that has already happened. Only these count toward absences.
export function isCountedMeeting(
  m: Pick<Meeting, "meets_on" | "kind">,
  today: string,
): boolean {
  return m.kind !== "none" && m.meets_on < today;
}

export type MeetingRow = Meeting & {
  session_id: string | null;
  state: MeetingState;
};

// Every meeting in date order, each with its session (if the classroom took attendance that week).
export function meetingRows(
  meetings: Meeting[],
  sessions: SessionLite[],
  today: string,
): MeetingRow[] {
  const byWeek = new Map(sessions.map((s) => [s.week_start, s.session_id]));
  return [...meetings]
    .sort((a, b) => a.meets_on.localeCompare(b.meets_on))
    .map((m) => {
      const session_id = byWeek.get(m.week_start) ?? null;
      return {
        ...m,
        session_id,
        state: meetingState(m, session_id !== null, today),
      };
    });
}

// Sessions whose week has no meeting in the schedule. Shown so no submitted roll goes missing.
export function offSchedule(
  sessions: SessionLite[],
  meetings: Pick<Meeting, "week_start">[],
): SessionLite[] {
  const weeks = new Set(meetings.map((m) => m.week_start));
  return sessions
    .filter((s) => !weeks.has(s.week_start))
    .sort((a, b) => b.week_start.localeCompare(a.week_start));
}

// The first meeting that is today or still to come, for a "Next" marker.
export function nextMeetingId(rows: MeetingRow[]): string | null {
  return (
    rows.find((r) => r.state === "upcoming" || r.state === "today")?.id ?? null
  );
}

export type AbsenceRow = {
  user_id: string;
  name: string;
  absent: number;
  counted: number; // present, late and absent (excused is left out)
};

// Most absences first, then by name. Counts only marks in sessions for real meetings that have passed.
// Excused marks don't count as absences, and an unmarked member in a submitted week isn't counted either.
export function absenceLeaders(input: {
  meetings: Pick<Meeting, "week_start" | "meets_on" | "kind">[];
  sessions: SessionLite[];
  marks: MarkLite[];
  names: Map<string, string>;
  today: string;
}): AbsenceRow[] {
  const countedWeeks = new Set(
    input.meetings
      .filter((m) => isCountedMeeting(m, input.today))
      .map((m) => m.week_start),
  );
  const countedSessions = new Set(
    input.sessions
      .filter((s) => countedWeeks.has(s.week_start))
      .map((s) => s.session_id),
  );

  const tally = new Map<string, { absent: number; counted: number }>();
  for (const mark of input.marks) {
    if (!countedSessions.has(mark.session_id) || mark.status === "excused")
      continue;
    const t = tally.get(mark.user_id) ?? { absent: 0, counted: 0 };
    t.counted += 1;
    if (mark.status === "absent") t.absent += 1;
    tally.set(mark.user_id, t);
  }

  return [...tally.entries()]
    .filter(([, t]) => t.absent > 0)
    .map(([user_id, t]) => ({
      user_id,
      name: input.names.get(user_id) || "Former member",
      absent: t.absent,
      counted: t.counted,
    }))
    .sort((a, b) => b.absent - a.absent || a.name.localeCompare(b.name));
}

// The message the warn box starts with. The executive can edit it before sending.
export function defaultAbsenceWarning(absent: number): string {
  const times = absent === 1 ? "once" : `${absent} times`;
  return `You've missed chapter meetings ${times} so far this year. Come to the next one, or message your trainer if something's up.`;
}

// "Thu, Oct 15" for a meeting date (YYYY-MM-DD). Dates have no time of day, so UTC is exact.
export function meetingDateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
