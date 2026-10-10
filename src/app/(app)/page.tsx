import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { JoinForm } from "@/components/join-form";
import { BoardView } from "@/components/board-view";
import { CreateBar } from "@/components/create-bar";
import { HeroBanner } from "@/components/hero-banner";
import {
  AnnouncementList,
  HomeBox,
  QuickActions,
  StatTiles,
} from "@/components/home-panels";
import { canTeach, requireProfile, type Role } from "@/lib/auth";
import { roleLabel } from "@/lib/role-label";
import {
  getBoard,
  getMemberStats,
  getOnline,
  type MemberStats,
} from "@/lib/activity-data";
import { getAnnouncements, type AnnouncementRow } from "@/lib/announcements";
import {
  formatCount,
  parsePeriod,
  rankBoard,
  type Metric,
  type Period,
  type RankedRow,
} from "@/lib/activity";
import { ClassroomRow } from "@/components/classroom-row";
import { getMyClassrooms, type ClassroomSummary } from "@/lib/classrooms";
import { createBlankTest } from "@/app/(app)/c/[id]/tests/actions";
import { createBlankDeck } from "@/app/(app)/flashcards/actions";
import { DateStub, EventSummary } from "@/components/event-item";
import { getEvents, type EventRow } from "@/lib/events";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The header band: the brand banner (tiger, triangle and motto on the navy field) framed in ink, with your
// name and where you stand on a strip underneath, so Home opens on something to look at, not a bare heading.
function Header({
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
    rooms ? plural(rooms, "event") : null,
    `${formatCount(online)} online`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <header className="grid min-w-0 border-[3px] border-ink">
      <HeroBanner />
      <div className="grid min-w-0 gap-1 border-t-[3px] border-ink bg-ground px-3 py-4 sm:px-5">
        <p className="caps text-[14px] text-ink-2">Welcome back</p>
        <h1 className="font-display text-[clamp(2.5rem,10vw,4.5rem)] leading-[0.9] font-bold [overflow-wrap:anywhere] uppercase">
          {name}
        </h1>
        <p className="caps num text-[15px] text-ink-2">{line}</p>
      </div>
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
    <HomeBox
      id="board-h"
      title="Leaderboard"
      link={{ href: `/leaderboard?metric=${metric}&period=${period}`, text: "Full board" }}
    >
      <div className="grid gap-2 py-3">
        {place ? (
          <p className="caps num px-1 text-[15px] text-ink-2 sm:px-3">
            You&apos;re #{place} of {ranked.length}
          </p>
        ) : null}
        <BoardView
          base="/"
          metric={metric}
          period={period}
          rows={ranked}
          meId={meId}
          empty="Nothing ranked yet"
          limit={5}
          metrics={["elo"]}
        />
      </div>
    </HomeBox>
  );
}

type Step = { title: string; done: boolean; href?: string; action?: string };

// Trainer first run. Each step reads real data and strikes through when it's done.
function Setup({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <section
      aria-labelledby="setup-h"
      className="grid gap-5 border-[3px] border-ink bg-field px-4 py-6 text-on-field sm:px-8 lg:py-8"
    >
      <h2
        id="setup-h"
        className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
      >
        Get your event running
      </h2>
      <ol className="grid">
        {steps.map((step, i) => {
          const isCurrent = i === current;
          const waiting = !step.done && !isCurrent;
          return (
            <li
              key={step.title}
              aria-current={isCurrent ? "step" : undefined}
              className={`grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-t-2 py-4 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] ${
                waiting ? "border-on-field-2/40" : "border-on-field-2"
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

// A navy band: the heading and the code box side by side on wider screens, stacked on a phone.
function Join() {
  return (
    <section
      aria-labelledby="join-h"
      className="grid gap-4 border-[3px] border-ink bg-field px-4 py-5 text-on-field sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end sm:gap-10 sm:px-6 sm:py-6"
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

// The next three things on the calendar.
function ComingUp({ events }: { events: EventRow[] }) {
  return (
    <HomeBox id="soon-h" title="Coming up" link={{ href: "/calendar", text: "Calendar" }}>
      {events.length ? (
        <ul>
          {events.map((e, i) => (
            <li key={e.id} className={i ? "border-t border-rule" : ""}>
              <Link
                href="/calendar"
                className="step grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4 px-3 py-3 hover:bg-band sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:px-4"
              >
                <DateStub iso={e.starts_at} />
                <EventSummary e={e} compact />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-5 text-[16px] text-ink-2 sm:px-4">Nothing on the calendar yet.</p>
      )}
    </HomeBox>
  );
}

// Your events, with joining another as the last row: once you're in one, it's a side errand.
function Classrooms({ rooms }: { rooms: ClassroomSummary[] }) {
  return (
    <HomeBox id="rooms-h" title="Your events" link={{ href: "/events", text: "All" }}>
      <ul>
        {rooms.map((room) => (
          <ClassroomRow key={room.id} room={room} />
        ))}
      </ul>
      <Link
        href="/join"
        className="caps step flex h-14 items-center justify-between px-3 text-[16px] text-ink-2 hover:bg-band hover:text-ink sm:px-4"
      >
        Got a code? Join an event
        <ArrowRight size={20} strokeWidth={2} aria-hidden />
      </Link>
    </HomeBox>
  );
}

export default async function HomePage(props: PageProps<"/">) {
  const sp = await props.searchParams;
  // Home keeps it simple: Elo only. The full board has the other measures and the honor roll.
  const metric: Metric = "elo";
  const period = parsePeriod(sp.period);
  const who = requireProfile();
  const [profile, rooms, board, online, soon, news, stats] = await Promise.all([
    who,
    getMyClassrooms(),
    getBoard(period, null),
    getOnline(null),
    // The calendar, announcements and stat tiles are nice-to-haves on Home; an outage in one of them
    // shouldn't take Home down.
    getEvents({ limit: 3 }).catch(() => [] as EventRow[]),
    getAnnouncements(null, 3).catch(() => [] as AnnouncementRow[]),
    who
      .then((p) => getMemberStats(p.id))
      .catch(() => null as MemberStats | null),
  ]);
  const teach = canTeach(profile);
  const first = profile.full_name.split(" ")[0] || profile.full_name;
  const ranked = rankBoard(board, metric, period);

  const owned = rooms.filter((r) => r.is_owner);
  const firstOwned = owned[0];
  const steps: Step[] = [
    {
      title: "Make an event",
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

  // Order of use: who you are, where to go next, your numbers, making things (trainers), your events, then
  // what's on and how the chapter ranks. Joining leads only until you're in an event.
  return (
    <div className="grid grid-cols-1 gap-6 sm:gap-8">
      <Header
        name={first}
        role={profile.role}
        title={profile.title}
        rooms={rooms.length}
        online={online.length}
      />
      {rooms.length ? null : <Join />}
      <QuickActions />
      <StatTiles stats={stats} />
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
      {rooms.length ? <Classrooms rooms={rooms} /> : null}
      <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
        <ComingUp events={soon} />
        <HomeBox
          id="news-h"
          title="Announcements"
          link={{ href: "/announcements", text: "All" }}
        >
          <AnnouncementList items={news} />
        </HomeBox>
      </div>
      <ClubBoard
        metric={metric}
        period={period}
        ranked={ranked}
        meId={profile.id}
      />
    </div>
  );
}
