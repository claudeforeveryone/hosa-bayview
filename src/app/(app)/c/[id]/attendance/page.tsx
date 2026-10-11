import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AbsenceList } from "@/components/absence-list";
import { AttendanceRoster } from "@/components/attendance-roster";
import { EmptyState } from "@/components/empty-state";
import {
  MeetingList,
  type MeetingItem,
  type RosterEntry,
} from "@/components/meeting-list";
import {
  addDays,
  attendanceRate,
  countStatuses,
  currentWeek,
  formatStamp,
  isIsoDate,
  torontoToday,
  weekLabel,
  weekStartOf,
  type Status,
} from "@/lib/attendance";
import { requireProfile } from "@/lib/auth";
import { getClassroom, getRoster } from "@/lib/classrooms";
import {
  absenceLeaders,
  KIND_LABEL,
  meetingDateLabel,
  meetingRows,
  nextMeetingId,
  offSchedule,
  type MeetingRow,
} from "@/lib/meetings";
import { avatarSources } from "@/lib/avatar-urls";
import { SeasonGrid } from "@/components/attendance-tracker";
import { RosterManage } from "@/components/roster-manage";
import { classLabel, currentWeekIndex } from "@/lib/roster";
import { loadRoster } from "@/lib/roster-data";
import { saveAttendance } from "./actions";
import {
  getClassroomMarks,
  getMeetings,
  getPicturePaths,
  getSessionNotes,
  getWeeks,
} from "./queries";

export const metadata: Metadata = { title: "Attendance" };

const heading =
  "font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase";

// Each meeting's row for the list. A week with no meeting keeps its place in the list but is never expanded.
function toItem(
  r: MeetingRow,
  nextId: string | null,
  extra: {
    members?: RosterEntry[];
    note?: string;
    own?: Status | null;
    manage: boolean;
  },
): MeetingItem {
  const none = r.kind === "none";
  return {
    key: r.id,
    title: r.title,
    date: r.meets_on,
    kindLabel: KIND_LABEL[r.kind],
    none,
    state: r.state,
    isNext: r.id === nextId,
    note: extra.note || undefined,
    members: extra.manage && !none ? extra.members : undefined,
    sheetWeek: extra.manage && !none ? r.week_start : null,
    ownStatus: extra.manage ? undefined : (extra.own ?? null),
  };
}

export default async function AttendanceTab({
  params,
  searchParams,
}: PageProps<"/c/[id]/attendance">) {
  const { id } = await params;
  const query = await searchParams;
  const [me, room] = await Promise.all([requireProfile(), getClassroom(id)]);
  if (!room) notFound();

  const [weeks, marks, meetings] = await Promise.all([
    getWeeks(id),
    getClassroomMarks(id),
    getMeetings(),
  ]);
  const now = new Date();
  const today = torontoToday(now);
  const sessions = weeks.map((w) => ({
    session_id: w.session_id,
    week_start: w.week_start,
  }));
  const rows = meetingRows(meetings, sessions, today);
  const nextId = nextMeetingId(rows);
  const extraWeeks = offSchedule(sessions, meetings);
  const marksBySession = new Map<string, Map<string, Status>>();
  for (const m of marks) {
    const row = marksBySession.get(m.session_id) ?? new Map<string, Status>();
    row.set(m.user_id, m.status);
    marksBySession.set(m.session_id, row);
  }

  if (!room.can_manage) {
    // Members: RLS already limited the marks to their own rows.
    const mine = new Map<string, Status>();
    for (const m of marks)
      if (m.user_id === me.id) mine.set(m.session_id, m.status);
    const counts = countStatuses([...mine.values()]);
    const { attended, counted, rate } = attendanceRate(counts);
    const items: MeetingItem[] = [
      ...rows.map((r) =>
        toItem(r, nextId, {
          manage: false,
          own: r.session_id ? (mine.get(r.session_id) ?? null) : null,
        }),
      ),
      ...extraWeeks.map((s) => ({
        key: `off-${s.session_id}`,
        title: "Extra week",
        date: addDays(s.week_start, 3),
        kindLabel: "Off schedule",
        none: false,
        state: "off-schedule" as const,
        isNext: false,
        ownStatus: mine.get(s.session_id) ?? null,
      })),
    ];

    return (
      <div className="grid gap-12">
        <section aria-labelledby="mine-h" className="grid gap-6">
          <h2 id="mine-h" className={heading}>
            Your attendance
          </h2>
          {weeks.length === 0 ? (
            <EmptyState title="No meetings marked yet" />
          ) : (
            <dl className="grid grid-cols-2 border-t border-l border-rule sm:grid-cols-5">
              {[
                ["Rate", rate === null ? "None yet" : `${rate}%`],
                ["Attended", `${attended} of ${counted}`],
                ["Late", counts.late],
                ["Absent", counts.absent],
                ["Excused", counts.excused],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="grid gap-1 border-r border-b border-rule px-4 py-4"
                >
                  <dt className="caps text-[14px] text-ink-2">{label}</dt>
                  <dd className="num font-display text-[32px] leading-none font-bold">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section aria-labelledby="meetings-h" className="grid gap-6">
          <h2 id="meetings-h" className={heading}>
            Meetings
          </h2>
          <MeetingList items={items} classroomId={room.id} manage={false} />
          <p className="text-[15px] text-ink-2">
            Every meeting on the chapter schedule. You only see your own marks.
          </p>
        </section>
      </div>
    );
  }

  // Trainers and executives: take attendance for one week, see who is absent, then review every meeting.
  const weekParam = typeof query.week === "string" ? query.week : "";
  const week = isIsoDate(weekParam) ? weekStartOf(weekParam) : currentWeek(now);
  const session = weeks.find((w) => w.week_start === week) ?? null;
  const roster = await getRoster(id);
  const members = roster.map((m) => ({
    user_id: m.user_id,
    full_name: m.full_name,
  }));
  // Notes are trainer-only; this branch never reaches members.
  const notes = await getSessionNotes(id);
  const current = new Map<string, Status>();
  if (session)
    for (const m of marks)
      if (m.session_id === session.session_id) current.set(m.user_id, m.status);
  const thisWeek = weekStartOf(today);
  const weekMeeting = meetings.find((m) => m.week_start === week) ?? null;

  // Roster pictures: one lookup for paths, one for signed URLs.
  const picturePaths = await getPicturePaths();
  const rosterPaths = roster.map((m) => picturePaths.get(m.user_id) ?? null);
  const pictures = await avatarSources(rosterPaths);
  const rosterEntries = (sessionId: string | null): RosterEntry[] =>
    roster.map((m) => {
      const path = picturePaths.get(m.user_id) ?? null;
      return {
        user_id: m.user_id,
        name: m.full_name,
        src: path ? (pictures.get(path) ?? null) : null,
        status: sessionId
          ? (marksBySession.get(sessionId)?.get(m.user_id) ?? null)
          : null,
      };
    });

  // The weekly tracker sheet (0103): this room only; RLS already limits it to managers.
  const sheet = await loadRoster(room.id);
  const sheetRoom = sheet.classes[0] ?? null;

  const absences = absenceLeaders({
    meetings,
    sessions,
    marks,
    names: new Map(roster.map((m) => [m.user_id, m.full_name])),
    today,
  });

  const submittedLine = session
    ? `Submitted by ${session.submitted_by_name ?? "a trainer"}, ${formatStamp(session.submitted_at)}`
    : null;
  const editedLine = session?.updated_at
    ? `Edited by ${session.updated_by_name ?? "a trainer"}, ${formatStamp(session.updated_at)}`
    : null;

  const items: MeetingItem[] = [
    ...rows.map((r) =>
      toItem(r, nextId, {
        manage: true,
        members: rosterEntries(r.session_id),
        note: r.session_id ? notes.get(r.session_id) : undefined,
      }),
    ),
    ...extraWeeks.map((s) => ({
      key: `off-${s.session_id}`,
      title: "Extra week",
      date: addDays(s.week_start, 3),
      kindLabel: "Off schedule",
      none: false,
      state: "off-schedule" as const,
      isNext: false,
      note: notes.get(s.session_id) || undefined,
      members: rosterEntries(s.session_id),
      sheetWeek: s.week_start,
    })),
  ];

  return (
    <div className="grid gap-12">
      <section aria-labelledby="week-h" className="grid gap-6">
        <div className="grid gap-2">
          <h2 id="week-h" className={heading}>
            {week === thisWeek ? "This week" : weekLabel(week)}
          </h2>
          {weekMeeting ? (
            <p className="caps text-[16px] text-ink-2">
              {weekMeeting.title} · {meetingDateLabel(weekMeeting.meets_on)}
            </p>
          ) : (
            <p className="caps text-[16px] text-ink-2">{weekLabel(week)}</p>
          )}
        </div>
        {members.length === 0 ? (
          <EmptyState title="No members yet" />
        ) : (
          <AttendanceRoster
            key={`${week}|${session?.session_id ?? "new"}|${session?.updated_at ?? session?.submitted_at ?? ""}`}
            action={saveAttendance.bind(null, room.id)}
            week={week}
            members={members}
            initial={Object.fromEntries(current)}
            initialNote={session ? (notes.get(session.session_id) ?? "") : ""}
            saved={session !== null}
            submittedLine={submittedLine}
            editedLine={editedLine}
          />
        )}
      </section>

      {sheetRoom ? (
        <section aria-labelledby="tracker-h" className="grid gap-6">
          <div className="grid gap-2">
            <h2 id="tracker-h" className={heading}>
              Weekly tracker
            </h2>
            <p className="text-[16px] text-ink-2">
              The chapter sheet for this event: tap a box to mark someone
              present. It saves straight away.
            </p>
          </div>
          {sheet.weeks.length === 0 ? (
            <EmptyState title="No meeting dates yet" mark={false}>
              Executives add them from Admin, Attendance.
            </EmptyState>
          ) : sheetRoom.members.length > 0 ? (
            <SeasonGrid
              key={sheetRoom.id}
              label={classLabel(sheetRoom.code, sheetRoom.name)}
              members={sheetRoom.members}
              weeks={sheet.weeks}
              currentIndex={currentWeekIndex(sheet.weeks, today)}
              initialPresent={sheet.present}
            />
          ) : (
            <EmptyState title="No names on this roster yet" mark={false}>
              Add them under Manage roster.
            </EmptyState>
          )}
          <RosterManage
            classroomId={sheetRoom.id}
            code={sheetRoom.code}
            members={sheetRoom.members}
            isExec={me.role === "executive"}
          />
        </section>
      ) : null}

      <section aria-labelledby="absent-h" className="grid gap-6">
        <div className="grid gap-2">
          <h2 id="absent-h" className={heading}>
            Most absences
          </h2>
          <p className="text-[16px] text-ink-2">
            Meetings that have passed and were taken. Excused doesn&apos;t
            count. Executives can send a warning from the admin page.
          </p>
        </div>
        <AbsenceList
          rows={absences.slice(0, 10)}
          canWarn={false}
          empty="No absences yet."
        />
      </section>

      <section aria-labelledby="meetings-h" className="grid gap-6">
        <h2 id="meetings-h" className={heading}>
          Meetings
        </h2>
        {items.length === 0 ? (
          <EmptyState title="No meetings on the schedule yet" mark={false} />
        ) : (
          <MeetingList items={items} classroomId={room.id} manage />
        )}
        <p className="text-[15px] text-ink-2">
          Open a meeting to see everyone&apos;s marks. Notes are only for
          trainers.
        </p>
      </section>
    </div>
  );
}
