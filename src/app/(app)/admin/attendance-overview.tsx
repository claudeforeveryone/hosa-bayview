import { createClient } from "@/lib/supabase/server";
import {
  attendanceRate,
  fetchAllPages,
  formatSessionDate,
  isStatus,
  summarizeOverview,
  type MarkRow,
  type Page,
  type SessionFact,
} from "@/lib/attendance";

type Person = { id: string; full_name: string; email: string };

type SessionDb = { id: string; held_on: string; classrooms: { name: string } | { name: string }[] | null };
type MarkDb = { session_id: string; user_id: string; status: string };

// Every classroom's sessions and every member's rate. Executives can read all of it through RLS.
// Read page by page: PostgREST stops each request at 1000 rows.
export async function AttendanceOverview({ people }: { people: Person[] }) {
  const supabase = await createClient();
  const [sessionRows, markRows] = await Promise.all([
    fetchAllPages<SessionDb>(
      (from, to) =>
        supabase
          .from("attendance_sessions")
          .select("id, held_on, classroom_id, classrooms!inner(name)")
          .order("held_on", { ascending: false })
          .order("id")
          .range(from, to) as unknown as Page<SessionDb>,
    ),
    fetchAllPages<MarkDb>(
      (from, to) =>
        supabase
          .from("attendance_marks")
          .select("session_id, user_id, status")
          .order("session_id")
          .order("user_id")
          .range(from, to) as unknown as Page<MarkDb>,
    ),
  ]);

  const sessions: SessionFact[] = sessionRows.map((s) => {
    const c = Array.isArray(s.classrooms) ? s.classrooms[0] : s.classrooms;
    return { id: s.id, held_on: s.held_on, classroom_name: c?.name ?? "Unknown classroom" };
  });
  const marks: MarkRow[] = markRows.flatMap((m) =>
    isStatus(m.status) ? [{ session_id: m.session_id, user_id: m.user_id, status: m.status }] : [],
  );
  const { sessionRows: sessionSummary, memberRows } = summarizeOverview(sessions, marks);
  const names = new Map(people.map((p) => [p.id, p.full_name || p.email]));
  const members = memberRows
    .map((m) => ({ ...m, name: names.get(m.user_id) ?? "Former member" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section aria-labelledby="att-h" className="grid gap-10">
      <div className="grid gap-6">
        <h2 id="att-h" className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase">
          Attendance
        </h2>
        {sessionSummary.length === 0 ? (
          <p className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
            No sessions yet
          </p>
        ) : (
          // Wide table: it scrolls inside its own box, never the page.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-t border-rule text-left text-[16px]">
              <thead className="caps text-[14px] text-ink-2">
                <tr className="border-b border-rule">
                  <th scope="col" className="px-1 py-3 font-medium sm:px-3">Classroom</th>
                  <th scope="col" className="px-1 py-3 font-medium sm:px-3">Date</th>
                  <th scope="col" className="px-1 py-3 text-right font-medium sm:px-3">Present</th>
                  <th scope="col" className="px-1 py-3 text-right font-medium sm:px-3">Marked</th>
                </tr>
              </thead>
              <tbody>
                {sessionSummary.map((s) => (
                  <tr key={s.id} className="border-b border-rule">
                    <td className="px-1 py-3 sm:px-3">{s.classroom_name}</td>
                    <td className="px-1 py-3 sm:px-3">{formatSessionDate(s.held_on)}</td>
                    <td className="num px-1 py-3 text-right sm:px-3">{s.counts.present}</td>
                    <td className="num px-1 py-3 text-right sm:px-3">
                      {s.marked ? s.marked : <span className="text-ink-2">Not marked</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-6">
        <h3 className="caps text-[17px] font-semibold">Member rate</h3>
        <p className="text-[15px] text-ink-2">Present or late, out of everything marked except excused.</p>
        {members.length === 0 ? (
          <p className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
            No marks yet
          </p>
        ) : (
          <ul className="border-t border-rule">
            {members.map((m) => {
              const r = attendanceRate(m.counts);
              return (
                <li key={m.user_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule px-1 py-3 sm:px-3">
                  <span className="min-w-0 truncate text-[17px] font-medium">{m.name}</span>
                  <span className="num text-right text-[16px] text-ink-2">
                    {r.attended} of {r.counted}
                    {r.rate === null ? "" : <span className="font-semibold text-ink"> · {r.rate}%</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
