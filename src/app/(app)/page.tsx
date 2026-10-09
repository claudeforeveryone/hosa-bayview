import Link from "next/link";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { JoinForm } from "@/components/join-form";
import { BoardView } from "@/components/board-view";
import { CreateBar } from "@/components/create-bar";
import { HeroBanner } from "@/components/hero-banner";
import { canTeach, requireProfile, type Role } from "@/lib/auth";
import { roleLabel } from "@/lib/role-label";
import { getBoard, getOnline } from "@/lib/activity-data";
import {
  formatCount,
  parsePeriod,
  rankBoard,
  type Metric,
  type Period,
  type RankedRow,
} from "@/lib/activity";
import { getMyClassrooms, type ClassroomSummary } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";
import { createBlankTest } from "@/app/(app)/c/[id]/tests/actions";
import { createBlankDeck } from "@/app/(app)/flashcards/actions";
import { DateStub, EventSummary } from "@/components/event-item";
import { getEvents, type EventRow } from "@/lib/events";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
function Hello({
  name,
  role,
  title,
  rooms,
  online,
}: {
  name: string;
  role: Role;
  title: string | null;
  rooms: number;
  online: number;
}) {
  const line = [
    roleLabel(role, title),
    rooms ? plural(rooms, "classroom") : null,
    `${formatCount(online)} online`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <header className="grid min-w-0 gap-1 px-1 sm:px-3">
      <h1 className="font-display text-[clamp(2.75rem,11vw,5rem)] leading-[0.9] font-bold [overflow-wrap:anywhere] uppercase">
        {name}
      </h1>
      <p className="caps num text-[16px] text-ink-2">{line}</p>
    </header>
  );
}

// The club board on Home: top five by Elo, where you stand, and a link to the full board.
function ClubBoard({
  metric,
  period,
  ranked,
  meId,
}: {
  metric: Metric;
  period: Period;
  ranked: RankedRow[];
  meId: string;
}) {
  const place = ranked.find((r) => r.user_id === meId)?.place;
  return (
    <section aria-labelledby="board-h" className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-1 sm:px-3">
        <h2
          id="board-h"
          className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
        >
          Leaderboard
        </h2>
        {place ? (
          <p className="caps num text-[16px] text-ink-2">
            You&apos;re #{place} of {ranked.length}
          </p>
        ) : null}
      </div>
      <BoardView
        base="/"
        metric={metric}
        period={period}
        rows={ranked}
        meId={meId}
        empty="Nothing ranked yet"
        limit={5}
        metrics={["elo"]}
        more={{
          href: `/leaderboard?metric=${metric}&period=${period}`,
          text: "Full board",
        }}
      />
    </section>
  );
}

type Step = { title: string; done: boolean; href?: string; action?: string };

// Trainer first run. Each step reads real data and strikes through when it's done.
function Setup({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <section
      aria-labelledby="setup-h"
      className="grid gap-5 bg-field px-4 py-6 text-on-field sm:px-8 lg:py-8"
    >
      <h2
        id="setup-h"
        className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
      >
        Get your room running
      </h2>
      <ol className="grid">
        {steps.map((step, i) => {
          const isCurrent = i === current;
          const waiting = !step.done && !isCurrent;
          return (
            <li
              key={step.title}
              aria-current={isCurrent ? "step" : undefined}
              className={`grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-t py-4 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] ${
                waiting
                  ? "border-dashed border-on-field-2/60"
                  : "border-on-field-2"
              }`}
            >
              <span className="num grid size-11 place-items-center font-display text-[24px] font-bold sm:size-12">
                {step.done ? (
                  <Check
                    size={26}
                    strokeWidth={2.5}
                    aria-label="Done"
                    role="img"
                  />
                ) : (
                  <span className={isCurrent ? "" : "text-on-field-2"}>
                    {i + 1}
                  </span>
                )}
              </span>
              <span
                className={`font-display text-[clamp(1.4rem,5vw,1.9rem)] leading-tight font-semibold uppercase ${
                  step.done
                    ? "text-on-field-2 line-through decoration-2"
                    : waiting
                      ? "text-on-field-2"
                      : ""
                }`}
              >
                {step.title}
              </span>
              {isCurrent && step.href ? (
                <Link
                  href={step.href}
                  className="caps step col-start-2 inline-flex h-12 items-center justify-self-start bg-on-field px-5 text-[17px] text-field hover:bg-on-field-2 sm:col-start-3"
                >
                  {step.action}
                  <ArrowRight
                    size={20}
                    strokeWidth={2}
                    className="ml-2"
                    aria-hidden
                  />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// A slim navy band: the heading and the code box side by side on wider screens, stacked on a phone.
function Join() {
  return (
    <section
      aria-labelledby="join-h"
      className="grid gap-4 bg-field px-4 py-5 text-on-field sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end sm:gap-10 sm:px-6 sm:py-6"
    >
      <h2
        id="join-h"
        className="font-display text-[clamp(2rem,7vw,2.75rem)] leading-[0.9] font-bold uppercase sm:pb-3"
      >
        Got a code?
      </h2>
      <JoinForm />
    </section>
  );
}

// Once you're in a classroom, joining another is a side errand: one line, not a band.
function JoinLink() {
  return (
    <Link
      href="/join"
      className="caps step flex h-14 items-center justify-between border-y border-rule px-1 text-[17px] hover:bg-band sm:px-3"
    >
      Got a code? Join a classroom
      <ArrowRight size={20} strokeWidth={2} aria-hidden />
    </Link>
  );
}

// The next three things on the calendar. Hidden when nothing's planned.
function ComingUp({ events }: { events: EventRow[] }) {
  if (!events.length) return null;
  return (
    <section aria-labelledby="soon-h" className="grid gap-4">
      <div className="flex items-baseline justify-between gap-4 px-1 sm:px-3">
        <h2
          id="soon-h"
          className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
        >
          Coming up
        </h2>
        <Link
          href="/calendar"
          className="caps step text-[16px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink"
        >
          Calendar
        </Link>
      </div>
      <ul className="border-t border-rule">
        {events.map((e) => (
          <li key={e.id} className="border-b border-rule">
            <Link
              href="/calendar"
              className="step grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4 px-1 py-3 hover:bg-band sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:px-3"
            >
              <DateStub iso={e.starts_at} />
              <EventSummary e={e} compact />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClassroomRow({ room }: { room: ClassroomSummary }) {
  const meta = [
    // Most rooms are named after their event; don't say it twice.
    room.event.trim().toLowerCase() === room.name.trim().toLowerCase()
      ? null
      : room.event,
    room.is_owner ? "You run it" : room.owner_name,
    plural(room.member_count, "member"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="border-b border-rule">
      <Link
        href={`/c/${room.id}`}
        className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3"
      >
        <span className="min-w-0">
          <span className="block truncate font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
            {room.name}
          </span>
          <span className="block truncate text-[16px] text-ink-2">{meta}</span>
        </span>
        <span className="flex items-center gap-2 text-ink-2">
          <span className="num caps text-[15px]">
            {formNumber("C", room.num)}
          </span>
          <ChevronRight size={22} strokeWidth={1.75} aria-hidden />
        </span>
      </Link>
    </li>
  );
}

function Classrooms({ rooms }: { rooms: ClassroomSummary[] }) {
  return (
    <section aria-labelledby="rooms-h" className="grid gap-4">
      <h2
        id="rooms-h"
        className="px-1 font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase sm:px-3"
      >
        Your classrooms
      </h2>
      <ul className="border-t border-rule">
        {rooms.map((room) => (
          <ClassroomRow key={room.id} room={room} />
        ))}
      </ul>
    </section>
  );
}

export default async function HomePage(props: PageProps<"/">) {
  const sp = await props.searchParams;
  // Home keeps it simple: Elo only. The full board has the other measures and the honor roll.
  const metric: Metric = "elo";
  const period = parsePeriod(sp.period);
  const [profile, rooms, board, online, soon] = await Promise.all([
    requireProfile(),
    getMyClassrooms(),
    getBoard(period, null),
    getOnline(null),
    // The calendar is a nice-to-have on Home; an outage there shouldn't take Home down.
    getEvents({ limit: 3 }).catch(() => [] as EventRow[]),
  ]);
  const teach = canTeach(profile);
  const first = profile.full_name.split(" ")[0] || profile.full_name;
  const ranked = rankBoard(board, metric, period);

  const owned = rooms.filter((r) => r.is_owner);
  const firstOwned = owned[0];
  const steps: Step[] = [
    {
      title: "Make a classroom",
      done: owned.length > 0,
      href: "/c/new",
      action: "Make one",
    },
    {
      title: "Get your first member",
      done: owned.some((r) => r.member_count > 0),
      href: firstOwned ? `/c/${firstOwned.id}` : undefined,
      action: "Show the code",
    },
  ];
  // Only nag someone with no classrooms yet, or whose own room is still empty. An exec sitting in other
  // people's rooms doesn't need a setup checklist.
  const settingUp =
    teach &&
    (rooms.length === 0 || owned.length > 0) &&
    steps.some((s) => !s.done);

  // Order of use: make things (trainers), your classrooms, how you rank. Joining leads only until you're in one.
  return (
    <div className="grid grid-cols-1 gap-8">
      <HeroBanner blend />
      <Hello
        name={first}
        role={profile.role}
        title={profile.title}
        rooms={rooms.length}
        online={online.length}
      />
      {teach ? (
        <CreateBar
          rooms={rooms
            .filter((r) => r.can_manage)
            .map((r) => ({ id: r.id, name: r.name }))}
          newTest={createBlankTest}
          newDeck={createBlankDeck}
        />
      ) : null}
      {settingUp ? <Setup steps={steps} /> : null}
      {rooms.length ? <Classrooms rooms={rooms} /> : <Join />}
      <ComingUp events={soon} />
      <ClubBoard
        metric={metric}
        period={period}
        ranked={ranked}
        meId={profile.id}
      />
      {rooms.length ? <JoinLink /> : null}
    </div>
  );
}
