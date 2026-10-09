import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { EmptyState } from "@/components/empty-state";
import {
  STATUSES,
  STATUS_LABEL,
  countStatuses,
  formatStamp,
  weekLabel,
} from "@/lib/attendance";
import { AbsenceList } from "@/components/absence-list";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MemberSearch } from "./member-search";
import {
  loadAttendanceOverview,
  type MemberRow,
  type WeekStatus,
} from "./queries";

export const metadata: Metadata = { title: "Attendance" };

const heading =
  "font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase";

function Callouts({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: MemberRow[];
  empty: string;
}) {
  return (
    <div className="grid gap-4">
      <h3 className="caps text-[17px] font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-[17px] text-ink-2">{empty}</p>
      ) : (
        <ul className="border-t border-rule">
          {rows.map((m) => (
            <li
              key={m.user_id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule px-1 py-3 sm:px-3"
            >
              <span className="min-w-0 truncate text-[18px] font-medium">
                {m.name}
              </span>
              <span className="num text-right text-[16px] text-ink-2">
                {m.attended} of {m.counted} weeks
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One classroom's week. Submitted ones open in place to show the roll as it was taken.
function WeekRow({ room, week }: { room: WeekStatus; week: string }) {
  if (room.state === "Not submitted")
    return (
      <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule px-1 py-4 sm:px-3">
        <span className="min-w-0 truncate text-[18px] font-medium">
          {room.name}
        </span>
        <span className="caps text-[15px] text-danger">Not submitted</span>
      </li>
    );
  const counts = countStatuses(room.roll.map((r) => r.status));
  return (
    <li className="border-b border-rule">
      <details className="group">
        <summary className="step grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-4 px-1 py-4 hover:bg-band sm:px-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 truncate text-[18px] font-medium">
            {room.name}
          </span>
          <span className="caps text-[15px] text-ink-2">
            {room.state} ·{" "}
            {formatStamp(room.updated_at ?? room.submitted_at ?? "")}
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2}
            aria-hidden
            className="self-center text-ink-2 group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)]"
          />
        </summary>
        <div className="grid gap-4 px-1 pt-1 pb-6 sm:px-3">
          <p className="caps num text-[15px] text-ink-2">
            {STATUSES.map((st) => `${counts[st]} ${STATUS_LABEL[st]}`).join(
              " · ",
            )}
          </p>
          {room.roll.length ? (
            <ul className="border-t border-rule">
              {room.roll.map((m) => (
                <li
                  key={m.user_id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule py-2.5"
                >
                  <span className="min-w-0 truncate text-[17px]">{m.name}</span>
                  <span
                    className={`caps text-[15px] ${m.status === "absent" ? "text-danger" : m.status === "excused" ? "text-ink-2" : ""}`}
                  >
                    {STATUS_LABEL[m.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[16px] text-ink-2">No one marked.</p>
          )}
          <Link
            href={`/c/${room.classroom_id}/attendance?week=${week}`}
            className="caps justify-self-start text-[15px] underline underline-offset-4"
          >
            Open the sheet
          </Link>
        </div>
      </details>
    </li>
  );
}

export default async function AdminAttendancePage() {
  await requireRole("executive");
  // Demo executives can look but not warn (warn_member refuses them). Fails closed.
  const supabase = await createClient();
  const demo = await supabase.rpc("am_demo");
  const canWarn = demo.data === false;
  const { week, weekStatus, members, perfect, checkIn, absences } =
    await loadAttendanceOverview();
  const submitted = weekStatus.filter(
    (r) => r.state !== "Not submitted",
  ).length;

  return (
    <div className="grid grid-cols-1 gap-12">
      <PageTitle
        meta={
          <Link href="/admin" className="underline underline-offset-4">
            Back to admin
          </Link>
        }
      >
        Attendance
      </PageTitle>

      <section aria-labelledby="week-h" className="grid gap-6">
        <div className="grid gap-2">
          <h2 id="week-h" className={heading}>
            This week
          </h2>
          <p className="caps text-[16px] text-ink-2">
            {weekLabel(week)} · {submitted} of {weekStatus.length} classrooms
            submitted
          </p>
        </div>
        {weekStatus.length === 0 ? (
          <EmptyState title="No classrooms yet" />
        ) : (
          <ul className="border-t border-rule">
            {weekStatus.map((r) => (
              <WeekRow key={r.classroom_id} room={r} week={week} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="exc-h" className="grid gap-8">
        <h2 id="exc-h" className={heading}>
          Exceptions
        </h2>
        <p className="text-[16px] text-ink-2">
          Four or more counted weeks. Perfect is every week attended. Check in
          is under half.
        </p>
        <Callouts title="Perfect attendance" rows={perfect} empty="None yet." />
        <Callouts
          title="Needs a check-in"
          rows={checkIn}
          empty="None right now."
        />
      </section>

      <section aria-labelledby="absent-h" className="grid gap-6">
        <div className="grid gap-2">
          <h2 id="absent-h" className={heading}>
            Most absences
          </h2>
          <p className="text-[16px] text-ink-2">
            Meetings that have passed and were taken, across every classroom.
            Excused doesn&apos;t count. Warn sends a note to their screen.
          </p>
        </div>
        <AbsenceList
          rows={absences.slice(0, 15)}
          canWarn={canWarn}
          empty="No absences yet."
        />
      </section>

      <section aria-labelledby="all-h" className="grid gap-6">
        <h2 id="all-h" className={heading}>
          Members
        </h2>
        <p className="text-[16px] text-ink-2">
          Present or late, out of every week marked except excused. Each
          classroom counts separately.
        </p>
        {members.length === 0 ? (
          <EmptyState title="No marks yet" />
        ) : (
          <MemberSearch members={members} />
        )}
      </section>
    </div>
  );
}
