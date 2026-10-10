import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { OpenBattleRows } from "@/components/battle-entry";
import { BattleJoinForm } from "@/components/battle-join-form";
import { ClassroomRow } from "@/components/classroom-row";
import { JoinForm } from "@/components/join-form";
import { PageTitle } from "@/components/page-title";
import { canTeach, requireProfile } from "@/lib/auth";
import { groupByCategory } from "@/lib/classroom-tabs";
import { getMyClassrooms } from "@/lib/classrooms";
import { getOpenBattles } from "@/lib/battles";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage() {
  const [profile, rooms, battles] = await Promise.all([
    requireProfile(),
    getMyClassrooms(),
    // Null until the battle migrations are applied: then no battle code field either.
    getOpenBattles(null),
  ]);
  const groups = groupByCategory(rooms);
  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle>Events</PageTitle>
      {canTeach(profile) ? (
        <Link
          href="/c/new"
          className="caps step flex h-14 items-center justify-between border-y border-rule px-1 text-[17px] hover:bg-band sm:px-3"
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
      {groups.map((g, i) => (
        <section
          key={g.heading}
          aria-labelledby={`events-${i}`}
          className="grid gap-4"
        >
          <h2
            id={`events-${i}`}
            className="px-1 font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase sm:px-3"
          >
            {g.heading}
          </h2>
          <ul className="border-t border-rule">
            {g.rooms.map((room) => (
              <ClassroomRow key={room.id} room={room} />
            ))}
          </ul>
        </section>
      ))}
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
