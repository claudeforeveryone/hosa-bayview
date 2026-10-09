import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Plus } from "lucide-react";
import { JoinForm } from "@/components/join-form";
import { BoardView } from "@/components/board-view";
import { HeroBanner } from "@/components/hero-banner";
import { HonorRoll } from "@/components/honor-roll";
import { canTeach, requireProfile, type Role } from "@/lib/auth";
import { roleLabel } from "@/lib/role-label";
import { getBoard, getHonorRoll, getOnline } from "@/lib/activity-data";
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
  return (
    <header className="flex items-end justify-between gap-6 px-1 sm:px-3">
      <div className="grid min-w-0 gap-1">
        <h1 className="font-display text-[clamp(3rem,12vw,6rem)] leading-[0.88] font-bold [overflow-wrap:anywhere] uppercase">
          {name}
        </h1>
        <p className="caps text-[17px] text-ink-2">
          {roleLabel(role, title)}
          {rooms ? ` · ${plural(rooms, "classroom")}` : ""}
        </p>
      </div>
      <p className="caps num shrink-0 pb-2 text-[17px] text-ink-2">
        Members online {formatCount(online)}
      </p>
    </header>
  );
}

// The club board on Home: top ten by Elo, with a link to the full board.
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
  return (
    <section aria-labelledby="board-h" className="grid gap-4">
      <h2
        id="board-h"
        className="px-1 font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase sm:px-3"
      >
        Leaderboard
      </h2>
      <BoardView
        base="/"
        metric={metric}
        period={period}
        rows={ranked}
        meId={meId}
        empty="Nothing ranked yet"
        limit={10}
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

function Join({ big }: { big: boolean }) {
  return (
    <section
      aria-labelledby="join-h"
      className={`grid content-end gap-5 bg-field px-4 py-6 text-on-field sm:px-8 lg:py-8 ${big ? "min-h-[calc(100dvh-13rem)] lg:min-h-[28rem]" : ""}`}
    >
      <h2
        id="join-h"
        className="font-display text-[clamp(2.5rem,10vw,4.5rem)] leading-[0.92] font-bold uppercase"
      >
        Got a code?
      </h2>
      <JoinForm />
    </section>
  );
}

function ClassroomRow({ room }: { room: ClassroomSummary }) {
  const meta = [
    room.event,
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

function Classrooms({
  rooms,
  teach,
}: {
  rooms: ClassroomSummary[];
  teach: boolean;
}) {
  return (
    <section aria-labelledby="rooms-h" className="grid gap-4">
      <div className="flex items-end justify-between gap-4 px-1 sm:px-3">
        <h2
          id="rooms-h"
          className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
        >
          Your classrooms
        </h2>
        {teach ? (
          <Link
            href="/c/new"
            className="caps step inline-flex h-11 shrink-0 items-center gap-2 border border-ink px-4 text-[16px] hover:bg-band"
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            New
          </Link>
        ) : null}
      </div>
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
  // Home keeps it simple: Elo only. The full board has the other measures.
  const metric: Metric = "elo";
  const period = parsePeriod(sp.period);
  const [profile, rooms, board, online, honor] = await Promise.all([
    requireProfile(),
    getMyClassrooms(),
    getBoard(period, null),
    getOnline(null),
    getHonorRoll(),
  ]);
  const teach = canTeach(profile);
  const first = profile.full_name.split(" ")[0] || profile.full_name;
  const ranked = rankBoard(board, metric, period);
  const club = (
    <ClubBoard
      metric={metric}
      period={period}
      ranked={ranked}
      meId={profile.id}
    />
  );
  const honorRoll = <HonorRoll rows={honor} limit={10} />;

  // A trainee with nowhere to go yet only needs the code box, then the board.
  if (!rooms.length && !teach) {
    return (
      <div className="grid grid-cols-1 gap-8">
        <HeroBanner className="-mx-4 -mt-6 sm:mx-0 sm:mt-0" />
        <Hello
          name={first}
          role={profile.role}
          title={profile.title}
          rooms={0}
          online={online.length}
        />
        <Join big />
        {club}
        {honorRoll}
      </div>
    );
  }

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
  const settingUp = teach && steps.some((s) => !s.done);

  return (
    <div className="grid grid-cols-1 gap-8">
      <HeroBanner className="-mx-4 -mt-6 sm:mx-0 sm:mt-0" />
      <Hello
        name={first}
        role={profile.role}
        title={profile.title}
        rooms={rooms.length}
        online={online.length}
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid grid-cols-1 gap-8">
          {settingUp ? <Setup steps={steps} /> : null}
          {rooms.length ? <Classrooms rooms={rooms} teach={teach} /> : null}
          {club}
          {honorRoll}
        </div>
        <Join big={false} />
      </div>
    </div>
  );
}
