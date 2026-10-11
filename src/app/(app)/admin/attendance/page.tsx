import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  ClassPicker,
  SeasonGrid,
  WeekBoard,
} from "@/components/attendance-tracker";
import { RosterManage } from "@/components/roster-manage";
import {
  classLabel,
  currentWeekIndex,
  pickWeekIndex,
  weekLongLabel,
} from "@/lib/roster";
import { loadRoster } from "@/lib/roster-data";
import { PageTitle } from "@/components/page-title";
import { EmptyState } from "@/components/empty-state";
import {
  STATUSES,
  STATUS_LABEL,
  countStatuses,
  formatStamp,
  torontoToday,
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
            className="self-center text-ink-2 group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
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

// The weekly-roll reports (attendance_sessions, 0034): this week's submissions, exceptions, absences, members.
async function Reports() {
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
      <section aria-labelledby="week-h" className="grid gap-6">
        <div className="grid gap-2">
          <h2 id="week-h" className={heading}>
            Rolls this week
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

const VIEWS = [
  { id: "week", label: "All events" },
  { id: "grid", label: "Season sheet" },
  { id: "reports", label: "Reports" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const BASE = "/admin/attendance";
const GRID_HREF = `${BASE}?view=grid&class=`;

// The paper sheet's columns are the chapter meeting dates; with none yet, say how to add the first.
function NoWeeks({ isExec }: { isExec: boolean }) {
  return (
    <EmptyState title="No meeting dates yet">
      {isExec
        ? "Open Season sheet, then Manage roster, to add the first date."
        : null}
    </EmptyState>
  );
}

// Default view: every event's names for one meeting, Present / Not present, one tap each.
async function AllEvents({
  weekParam,
  isExec,
}: {
  weekParam?: string;
  isExec: boolean;
}) {
  const { classes, weeks, present } = await loadRoster();
  if (weeks.length === 0) return <NoWeeks isExec={isExec} />;
  const index = pickWeekIndex(weeks, weekParam, torontoToday());
  const week = weeks[index];
  const rostered = classes.filter((c) => c.members.length > 0);
  const prev = weeks[index - 1];
  const next = weeks[index + 1];
  const arrow =
    "step press grid h-12 w-12 shrink-0 place-items-center border-2 border-ink hover:bg-band";
  const off =
    "grid h-12 w-12 shrink-0 place-items-center border-2 border-rule text-rule-strong";
  const keys = present.filter((k) => k.endsWith(`|${week.id}`));

  return (
    <section aria-labelledby="board-h" className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {prev ? (
          <Link
            href={`${BASE}?week=${prev.meet_on}`}
            className={arrow}
            aria-label={`Previous meeting, ${weekLongLabel(prev.meet_on)}`}
          >
            <ChevronLeft size={24} strokeWidth={2} aria-hidden />
          </Link>
        ) : (
          <span className={off} aria-hidden>
            <ChevronLeft size={24} strokeWidth={2} />
          </span>
        )}
        <div className="grid min-w-0 flex-1 gap-0.5 text-center sm:flex-none sm:px-4">
          <h2
            id="board-h"
            className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-none font-bold uppercase"
          >
            {weekLongLabel(week.meet_on)}
          </h2>
          <p className="caps num text-[14px] text-ink-2">
            Meeting {index + 1} of {weeks.length}
            {index === currentWeekIndex(weeks, torontoToday())
              ? " · this week"
              : ""}
          </p>
        </div>
        {next ? (
          <Link
            href={`${BASE}?week=${next.meet_on}`}
            className={arrow}
            aria-label={`Next meeting, ${weekLongLabel(next.meet_on)}`}
          >
            <ChevronRight size={24} strokeWidth={2} aria-hidden />
          </Link>
        ) : (
          <span className={off} aria-hidden>
            <ChevronRight size={24} strokeWidth={2} />
          </span>
        )}
      </div>
      {rostered.length === 0 ? (
        <EmptyState title="No one has joined an event yet">Names show up here as members join events with a code.</EmptyState>
      ) : (
        <WeekBoard
          key={week.id}
          classes={rostered.map((c) => ({
            id: c.id,
            label: classLabel(c.code, c.name),
            members: c.members,
          }))}
          week={week}
          initialPresent={keys}
          gridHrefBase={GRID_HREF}
        />
      )}
      <p className="text-[15px] text-ink-2">
        Tap a name to switch between Present and Not present; it saves straight
        away. Open an event for its whole season.
      </p>
    </section>
  );
}

// One event's whole season, like the paper sheet.
async function Season({
  classParam,
  isExec,
}: {
  classParam?: string;
  isExec: boolean;
}) {
  const { classes, weeks, present } = await loadRoster();
  if (classes.length === 0) return <EmptyState title="No events yet" />;
  const rostered = classes.filter((c) => c.members.length > 0);
  const room =
    classes.find((c) => c.id === classParam) ?? rostered[0] ?? classes[0];
  const options = [...classes]
    .sort(
      (a, b) =>
        (a.code ?? "~").localeCompare(b.code ?? "~") ||
        a.name.localeCompare(b.name),
    )
    .map((c) => ({
      id: c.id,
      label: classLabel(c.code, c.name),
      rostered: c.members.length > 0,
    }));
  const label = classLabel(room.code, room.name);
  const ids = new Set(room.members.map((m) => m.id));
  const keys = present.filter((k) => ids.has(k.slice(0, k.indexOf("|"))));

  return (
    <section aria-labelledby="sheet-h" className="grid gap-6">
      <ClassPicker options={options} value={room.id} hrefFor={GRID_HREF} />
      <div className="grid gap-1">
        <h2 id="sheet-h" className={heading}>
          {label}
        </h2>
        <p className="caps num text-[15px] text-ink-2">
          {room.members.length} {room.members.length === 1 ? "name" : "names"} ·{" "}
          {weeks.length} meetings
        </p>
      </div>
      {weeks.length === 0 ? (
        <NoWeeks isExec={isExec} />
      ) : room.members.length === 0 ? (
        <EmptyState title="No one has joined this event yet">
          Share the event&apos;s join code. Members show up here as soon as they join.
        </EmptyState>
      ) : (
        <SeasonGrid
          key={room.id}
          label={label}
          members={room.members}
          weeks={weeks}
          currentIndex={currentWeekIndex(weeks, torontoToday())}
          initialPresent={keys}
        />
      )}
      <RosterManage
        classroomId={room.id}
        code={room.code}
        members={room.members}
        isExec={isExec}
      />
    </section>
  );
}

export default async function AdminAttendancePage({
  searchParams,
}: PageProps<"/admin/attendance">) {
  const [me, sp] = await Promise.all([requireRole("executive"), searchParams]);
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : undefined;
  const classParam = one(sp.class);
  const asked = one(sp.view);
  const view: View =
    VIEWS.find((v) => v.id === asked)?.id ?? (classParam ? "grid" : "week");
  const isExec = me.role === "executive";

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle
        meta={
          <Link href="/admin" className="underline underline-offset-4">
            Back to admin
          </Link>
        }
      >
        Attendance
      </PageTitle>
      <nav aria-label="Attendance views">
        <ul className="grid grid-cols-3 border-2 border-ink">
          {VIEWS.map((v) => {
            const on = v.id === view;
            return (
              <li key={v.id} className="border-r border-ink last:border-r-0">
                <Link
                  href={v.id === "week" ? BASE : `${BASE}?view=${v.id}`}
                  aria-current={on ? "page" : undefined}
                  className={`caps step flex h-12 items-center justify-center px-1 text-center text-[14px] leading-tight sm:h-14 sm:text-[17px] ${
                    on ? "bg-ink text-ground" : "text-ink hover:bg-band"
                  }`}
                >
                  {v.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {view === "week" ? (
        <AllEvents weekParam={one(sp.week)} isExec={isExec} />
      ) : null}
      {view === "grid" ? (
        <Season classParam={classParam} isExec={isExec} />
      ) : null}
      {view === "reports" ? <Reports /> : null}
    </div>
  );
}
