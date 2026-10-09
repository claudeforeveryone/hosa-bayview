import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceRoster } from "@/components/attendance-roster";
import { EmptyState } from "@/components/empty-state";
import {
  attendanceRate,
  countStatuses,
  currentWeek,
  formatStamp,
  isIsoDate,
  recentWeeks,
  STATUS_LABEL,
  STATUSES,
  torontoToday,
  weekLabel,
  weekStartOf,
  type MarkRow,
  type Status,
} from "@/lib/attendance";
import { getClassroom, getRoster } from "@/lib/classrooms";
import { requireProfile } from "@/lib/auth";
import { saveAttendance } from "./actions";
import {
  getClassroomMarks,
  getSessionNotes,
  getWeeks,
  type WeekRow,
} from "./queries";

export const metadata: Metadata = { title: "Attendance" };

// Trainers see the last this many weeks even when nothing was submitted, so gaps stand out.
const GAP_WEEKS = 8;

const heading =
  "font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase";

// Marks grouped by session id.
function bySession(marks: MarkRow[]) {
  const map = new Map<string, Status[]>();
  for (const m of marks)
    map.set(m.session_id, [...(map.get(m.session_id) ?? []), m.status]);
  return map;
}

// Newest first: every submitted week, plus the last few weeks since the room opened, even if empty.
function weekList(weeks: WeekRow[], createdAt: string, now: Date): string[] {
  const cur = currentWeek(now);
  const floor = weekStartOf(
    new Date(createdAt).toLocaleDateString("en-CA", {
      timeZone: "America/Toronto",
    }),
  );
  const gaps = recentWeeks(cur, GAP_WEEKS, floor);
  const all = new Set([...gaps, ...weeks.map((w) => w.week_start)]);
  return [...all].sort().reverse();
}

export default async function AttendanceTab({
  params,
  searchParams,
}: PageProps<"/c/[id]/attendance">) {
  const { id } = await params;
  const query = await searchParams;
  const [me, room] = await Promise.all([requireProfile(), getClassroom(id)]);
  if (!room) notFound();

  const [weeks, marks] = await Promise.all([
    getWeeks(id),
    getClassroomMarks(id),
  ]);
  const now = new Date();
  const byWeek = new Map(weeks.map((w) => [w.week_start, w]));
  const marksBySession = bySession(marks);

  if (!room.can_manage) {
    // Members: RLS already limited the marks to their own rows.
    const mine = new Map<string, Status>();
    for (const m of marks)
      if (m.user_id === me.id) mine.set(m.session_id, m.status);
    const counts = countStatuses([...mine.values()]);
    const { attended, counted, rate } = attendanceRate(counts);

    return (
      <div className="grid gap-12">
        <section aria-labelledby="mine-h" className="grid gap-6">
          <h2 id="mine-h" className={heading}>
            Your attendance
          </h2>
          {weeks.length === 0 ? (
            <EmptyState title="No weeks yet" />
          ) : (
            <>
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
              <ul className="border-t border-rule">
                {weeks.map((w) => {
                  const status = mine.get(w.session_id);
                  return (
                    <li
                      key={w.session_id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule px-1 py-4 sm:px-3"
                    >
                      <span className="min-w-0 truncate text-[19px] font-semibold">
                        {weekLabel(w.week_start)}
                      </span>
                      <span
                        className={`caps text-[15px] ${status ? "text-ink" : "text-ink-2"}`}
                      >
                        {status ? STATUS_LABEL[status] : "Not marked"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    );
  }

  // Trainers and executives: take attendance for one week, then review past weeks.
  const weekParam = typeof query.week === "string" ? query.week : "";
  const week = isIsoDate(weekParam) ? weekStartOf(weekParam) : currentWeek(now);
  const session = byWeek.get(week) ?? null;
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
  const list = weekList(weeks, room.created_at, now);
  const today = torontoToday(now);
  const thisWeek = weekStartOf(today);

  const submittedLine = session
    ? `Submitted by ${session.submitted_by_name ?? "a trainer"}, ${formatStamp(session.submitted_at)}`
    : null;
  const editedLine = session?.updated_at
    ? `Edited by ${session.updated_by_name ?? "a trainer"}, ${formatStamp(session.updated_at)}`
    : null;

  return (
    <div className="grid gap-12">
      <section aria-labelledby="week-h" className="grid gap-6">
        <div className="grid gap-2">
          <h2 id="week-h" className={heading}>
            {week === thisWeek ? "This week" : weekLabel(week)}
          </h2>
          {week === thisWeek ? (
            <p className="caps text-[16px] text-ink-2">{weekLabel(week)}</p>
          ) : null}
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

      <section aria-labelledby="past-h" className="grid gap-6">
        <h2 id="past-h" className={heading}>
          Weeks
        </h2>
        <ul className="border-t border-rule">
          {list.map((w) => {
            const s = byWeek.get(w);
            const c = countStatuses(
              s ? (marksBySession.get(s.session_id) ?? []) : [],
            );
            const marked = STATUSES.reduce((n, k) => n + c[k], 0);
            const state = !s
              ? "Not submitted"
              : s.updated_at
                ? "Edited"
                : "Submitted";
            return (
              <li key={w} className="border-b border-rule">
                <Link
                  href={`/c/${room.id}/attendance?week=${w}`}
                  aria-current={w === week ? "page" : undefined}
                  className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[clamp(1.4rem,4.5vw,2rem)] leading-[1.05] font-semibold uppercase">
                      {weekLabel(w)}
                    </span>
                    <span className={`caps block text-[15px] text-ink-2`}>
                      {state}
                      {s && marked
                        ? ` · ${c.present} of ${marked} present`
                        : ""}
                    </span>
                  </span>
                  {s && notes.get(s.session_id) ? (
                    <span className="hidden max-w-[24ch] truncate text-[16px] text-ink-2 sm:block">
                      {notes.get(s.session_id)}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-[15px] text-ink-2">
          Showing the last {GAP_WEEKS} weeks and every submitted week.
        </p>
      </section>
    </div>
  );
}
