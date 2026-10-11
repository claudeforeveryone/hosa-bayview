import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { OpenBattleRows } from "@/components/battle-entry";
import { BattleJoinForm } from "@/components/battle-join-form";
import { ClassroomRow } from "@/components/classroom-row";
import { JoinForm } from "@/components/join-form";
import { PageTitle } from "@/components/page-title";
import { canTeach, requireProfile } from "@/lib/auth";
import {
  RECENT_ROOMS_COOKIE,
  eventsLanding,
  groupByCategory,
  parseRecentRooms,
} from "@/lib/classroom-tabs";
import { getMyClassrooms, type ClassroomSummary } from "@/lib/classrooms";
import { getOpenBattles } from "@/lib/battles";
import { formNumber } from "@/lib/join-code";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Events" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const sectionHeading =
  "border-t-[3px] border-ink px-1 pt-3 font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase sm:px-3";

// The rooms you're a member of. Only an executive needs this: everyone else can only list their own rooms.
async function getMyMemberIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classroom_members")
    .select("classroom_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Membership lookup failed: ${error.message}`);
  return new Set((data ?? []).map((r) => r.classroom_id as string));
}

// One of your rooms as a big framed box: the whole box is the door.
function RoomBox({ room }: { room: ClassroomSummary }) {
  const event =
    room.event.trim().toLowerCase() === room.name.trim().toLowerCase()
      ? null
      : room.event;
  const meta = [
    event,
    room.is_owner ? "You run it" : room.owner_name,
    plural(room.member_count, "member"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <Link
        href={`/c/${room.id}`}
        className="step group grid h-full min-h-40 content-between gap-6 border-[3px] border-ink bg-ground p-4 hover:bg-band sm:p-5"
      >
        <span className="grid gap-2">
          <span className="font-display text-[clamp(2rem,8vw,3rem)] leading-[0.95] font-bold [overflow-wrap:anywhere] uppercase">
            {room.name}
          </span>
          <span className="text-[16px] text-ink-2">{meta}</span>
        </span>
        <span className="flex items-center justify-between gap-3 border-t border-rule-strong pt-3">
          <span className="num caps text-[15px] text-ink-2">
            {formNumber("C", room.num)}
          </span>
          <span className="caps flex items-center gap-2 text-[16px] font-semibold">
            Open
            <ArrowRight size={20} strokeWidth={2} aria-hidden />
          </span>
        </span>
      </Link>
    </li>
  );
}

// Tapping Events lands in your event: with exactly one room you go straight in (`?all=1` shows this list
// anyway, e.g. from the room's "All events" link). With several, yours come first as big boxes. An executive
// sees every room: their own and recently opened ones first, then the rest by category.
export default async function EventsPage(props: PageProps<"/events">) {
  const sp = await props.searchParams;
  const [profile, rooms, battles, jar] = await Promise.all([
    requireProfile(),
    getMyClassrooms(),
    // Null until the battle migrations are applied: then no battle code field either.
    getOpenBattles(null),
    cookies(),
  ]);
  const seesAll = profile.role === "executive";
  const memberIds = seesAll
    ? await getMyMemberIds(profile.id)
    : new Set<string>();
  const mineIds = new Set([
    ...memberIds,
    ...rooms.filter((r) => r.is_owner).map((r) => r.id),
  ]);
  const landing = eventsLanding(rooms, {
    mineIds,
    recentIds: parseRecentRooms(jar.get(RECENT_ROOMS_COOKIE)?.value),
    seesAll,
  });
  if ("go" in landing && sp.all !== "1") redirect(`/c/${landing.go.id}`);
  const mine = "go" in landing ? [landing.go] : landing.mine;
  const rest = "go" in landing ? [] : landing.rest;
  const groups = groupByCategory(rest);

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle>Events</PageTitle>
      {canTeach(profile) ? (
        <Link
          href="/c/new"
          className="caps step flex h-14 items-center justify-between border-2 border-ink px-4 text-[17px] hover:bg-band"
        >
          New event
          <Plus size={20} strokeWidth={2} aria-hidden />
        </Link>
      ) : null}
      {battles?.length ? (
        <section aria-label="Live battles">
          <OpenBattleRows rows={battles} showRoom />
        </section>
      ) : null}

      {mine.length ? (
        <section aria-labelledby="events-mine" className="grid gap-4">
          <h2 id="events-mine" className={sectionHeading}>
            {seesAll
              ? "Yours"
              : mine.length === 1
                ? "Your event"
                : "Your events"}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {mine.map((room) => (
              <RoomBox key={room.id} room={room} />
            ))}
          </ul>
        </section>
      ) : null}

      {groups.length ? (
        <section aria-labelledby="events-all" className="grid gap-6">
          <h2 id="events-all" className={sectionHeading}>
            {mine.length ? "All other events" : "All events"}
          </h2>
          {groups.map((g, i) => (
            <div key={g.heading ?? "main"} className="grid gap-2">
              {g.heading ? (
                <h3
                  id={`events-${i}`}
                  className="caps px-1 text-[18px] font-semibold text-ink-2 sm:px-3"
                >
                  {g.heading}
                </h3>
              ) : null}
              <ul
                aria-labelledby={g.heading ? `events-${i}` : "events-all"}
                className="border-t-2 border-ink"
              >
                {g.rooms.map((room) => (
                  <ClassroomRow key={room.id} room={room} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {!mine.length && !groups.length ? (
        <p className="max-w-[60ch] text-[17px] text-ink-2">
          You&apos;re not in an event yet. Get the code from your trainer and
          enter it below.
        </p>
      ) : null}

      <section
        aria-label="Join with a code"
        className="grid gap-5 bg-field px-4 py-6 text-on-field sm:px-8 lg:py-8"
      >
        <JoinForm />
        {battles ? <BattleJoinForm /> : null}
      </section>
    </div>
  );
}
