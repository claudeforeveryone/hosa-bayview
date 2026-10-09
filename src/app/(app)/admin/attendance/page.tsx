import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { EmptyState } from "@/components/empty-state";
import { formatStamp, weekLabel } from "@/lib/attendance";
import { requireRole } from "@/lib/auth";
import { MemberSearch } from "./member-search";
import { loadAttendanceOverview, type MemberRow } from "./queries";

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

export default async function AdminAttendancePage() {
  await requireRole("executive");
  const { week, weekStatus, members, perfect, checkIn } =
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
              <li
                key={r.classroom_id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule px-1 py-4 sm:px-3"
              >
                <span className="min-w-0 truncate text-[18px] font-medium">
                  {r.name}
                </span>
                <span
                  className={`caps text-[15px] ${r.state === "Not submitted" ? "text-danger" : "text-ink-2"}`}
                >
                  {r.state === "Not submitted"
                    ? "Not submitted"
                    : `${r.state} · ${formatStamp(r.updated_at ?? r.submitted_at ?? "")}`}
                </span>
              </li>
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
