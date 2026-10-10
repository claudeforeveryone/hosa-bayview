import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ClassroomRow } from "@/components/classroom-row";
import { JoinForm } from "@/components/join-form";
import { PageTitle } from "@/components/page-title";
import { canTeach, requireProfile } from "@/lib/auth";
import { groupByCategory } from "@/lib/classroom-tabs";
import { getMyClassrooms } from "@/lib/classrooms";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage() {
  const [profile, rooms] = await Promise.all([
    requireProfile(),
    getMyClassrooms(),
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
      </section>
    </div>
  );
}
