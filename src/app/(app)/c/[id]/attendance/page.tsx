import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceRoster } from "@/components/attendance-roster";
import { EmptyState } from "@/components/empty-state";
import { Button, Field } from "@/components/form";
import {
  attendanceRate,
  countStatuses,
  formatSessionDate,
  isIsoDate,
  STATUS_LABEL,
  STATUSES,
  torontoToday,
  type MarkRow,
  type Status,
} from "@/lib/attendance";
import { getClassroom, getRoster } from "@/lib/classrooms";
import { requireProfile } from "@/lib/auth";
import { saveAttendance } from "./actions";
import { getClassroomMarks, getSessionNotes, getSessions } from "./queries";

export const metadata: Metadata = { title: "Attendance" };

const heading = "font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase";

// Marks grouped by session id.
function bySession(marks: MarkRow[]) {
  const map = new Map<string, Status[]>();
  for (const m of marks) map.set(m.session_id, [...(map.get(m.session_id) ?? []), m.status]);
  return map;
}

export default async function AttendanceTab({ params, searchParams }: PageProps<"/c/[id]/attendance">) {
  const { id } = await params;
  const query = await searchParams;
  const [me, room] = await Promise.all([requireProfile(), getClassroom(id)]);
  if (!room) notFound();

  const [sessions, marks] = await Promise.all([getSessions(id), getClassroomMarks(id)]);

  if (!room.can_manage) {
    // Members: RLS already limited the marks to their own rows.
    const mine = new Map<string, Status>();
    for (const m of marks) if (m.user_id === me.id) mine.set(m.session_id, m.status);
    const counts = countStatuses([...mine.values()]);
    const { attended, counted, rate } = attendanceRate(counts);

    return (
      <div className="grid gap-12">
        <section aria-labelledby="mine-h" className="grid gap-6">
          <h2 id="mine-h" className={heading}>
            Your attendance
          </h2>
          {sessions.length === 0 ? (
            <EmptyState title="No sessions yet" />
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
                  <div key={label} className="grid gap-1 border-r border-b border-rule px-4 py-4">
                    <dt className="caps text-[14px] text-ink-2">{label}</dt>
                    <dd className="num font-display text-[32px] leading-none font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              <ul className="border-t border-rule">
                {sessions.map((s) => {
                  const status = mine.get(s.id);
                  return (
                    <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule px-1 py-4 sm:px-3">
                      <span className="min-w-0 truncate text-[19px] font-semibold">{formatSessionDate(s.held_on)}</span>
                      <span className={`caps text-[15px] ${status ? "text-ink" : "text-ink-2"}`}>
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

  // Trainers and executives: take attendance for one date, then review past sessions.
  const dateParam = typeof query.date === "string" ? query.date : "";
  const date = isIsoDate(dateParam) ? dateParam : torontoToday();
  const session = sessions.find((s) => s.held_on === date) ?? null;
  const roster = await getRoster(id);
  const members = roster.map((m) => ({ user_id: m.user_id, full_name: m.full_name }));
  const marksBySession = bySession(marks);
  // Notes are trainer-only; this branch never reaches members.
  const notes = await getSessionNotes(id);
  const current = new Map<string, Status>();
  if (session) for (const m of marks) if (m.session_id === session.id) current.set(m.user_id, m.status);

  return (
    <div className="grid gap-12">
      <section aria-labelledby="take-h" className="grid gap-6">
        <h2 id="take-h" className={heading}>
          Take attendance
        </h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Field label="Date" name="date" type="date" defaultValue={date} required />
          </div>
          <Button type="submit" variant="line">
            Open
          </Button>
        </form>
        {members.length === 0 ? (
          <EmptyState title="No members yet" />
        ) : (
          <AttendanceRoster
            key={`${date}-${session?.id ?? "new"}`}
            action={saveAttendance.bind(null, room.id)}
            date={date}
            members={members}
            initial={Object.fromEntries(current)}
            initialNote={session ? (notes.get(session.id) ?? "") : ""}
          />
        )}
      </section>

      <section aria-labelledby="past-h" className="grid gap-6">
        <h2 id="past-h" className={heading}>
          Sessions
        </h2>
        {sessions.length === 0 ? (
          <EmptyState title="No sessions yet" />
        ) : (
          <ul className="border-t border-rule">
            {sessions.map((s) => {
              const c = countStatuses(marksBySession.get(s.id) ?? []);
              const marked = STATUSES.reduce((n, k) => n + c[k], 0);
              return (
                <li key={s.id} className="border-b border-rule">
                  <Link
                    href={`/c/${room.id}/attendance?date=${s.held_on}`}
                    className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-display text-[clamp(1.4rem,4.5vw,2rem)] leading-[1.05] font-semibold uppercase">
                        {formatSessionDate(s.held_on)}
                      </span>
                      {notes.get(s.id) ? (
                        <span className="block truncate text-[16px] text-ink-2">{notes.get(s.id)}</span>
                      ) : null}
                    </span>
                    <span className="num text-[16px] text-ink-2">
                      {marked ? `${c.present} of ${marked} present` : "Not marked yet"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
