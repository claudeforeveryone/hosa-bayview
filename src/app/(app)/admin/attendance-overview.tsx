import Link from "next/link";
import { AbsenceList } from "@/components/absence-list";
import { loadAttendanceOverview } from "./attendance/queries";

// Compact admin summary: this week's submissions, the exceptions and the top few absences, with a link to the full view.
export async function AttendanceSummary({ canWarn }: { canWarn: boolean }) {
  const { weekStatus, perfect, checkIn, absences } =
    await loadAttendanceOverview();
  const submitted = weekStatus.filter(
    (r) => r.state !== "Not submitted",
  ).length;

  return (
    <section aria-labelledby="att-h" className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2
          id="att-h"
          className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
        >
          Attendance
        </h2>
        <Link
          href="/admin/attendance"
          className="caps step text-[17px] underline underline-offset-4"
        >
          Open attendance
        </Link>
      </div>
      <dl className="grid grid-cols-2 border-t border-l border-rule sm:grid-cols-3">
        <div className="grid gap-1 border-r border-b border-rule px-4 py-4">
          <dt className="caps text-[14px] text-ink-2">Submitted this week</dt>
          <dd className="num font-display text-[32px] leading-none font-bold">
            {submitted} of {weekStatus.length}
          </dd>
        </div>
        <div className="grid gap-1 border-r border-b border-rule px-4 py-4">
          <dt className="caps text-[14px] text-ink-2">Perfect</dt>
          <dd className="num font-display text-[32px] leading-none font-bold">
            {perfect.length}
          </dd>
        </div>
        <div className="grid gap-1 border-r border-b border-rule px-4 py-4">
          <dt className="caps text-[14px] text-ink-2">Needs a check-in</dt>
          <dd className="num font-display text-[32px] leading-none font-bold">
            {checkIn.length}
          </dd>
        </div>
      </dl>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="caps text-[17px] font-semibold">Most absences</h3>
          <Link
            href="/admin/attendance?view=reports#absent-h"
            className="caps text-[15px] underline underline-offset-4"
          >
            All absences
          </Link>
        </div>
        <AbsenceList
          rows={absences.slice(0, 5)}
          canWarn={canWarn}
          empty="No absences yet."
        />
      </div>
    </section>
  );
}
