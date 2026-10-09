import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { JoinForm } from "@/components/join-form";
import { Panel } from "@/components/panel";
import { canTeach, requireProfile } from "@/lib/auth";
import { getMyClassrooms, type ClassroomSummary } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Join({ first }: { first: boolean }) {
  return (
    <Panel label="Join a classroom" tone="field" size={first ? "full" : "auto"}>
      <h2 className="mb-5 font-display text-[clamp(2.75rem,11vw,5.5rem)] leading-[0.92] font-bold uppercase">
        Got a code?
      </h2>
      <JoinForm />
    </Panel>
  );
}

function ClassroomRow({ room }: { room: ClassroomSummary }) {
  const meta = [room.event, room.is_owner ? "You run it" : room.owner_name, plural(room.member_count, "member")]
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
          <span className="num caps text-[15px]">{formNumber("C", room.num)}</span>
          <ChevronRight size={22} strokeWidth={1.75} aria-hidden />
        </span>
      </Link>
    </li>
  );
}

function Classrooms({ rooms, teach }: { rooms: ClassroomSummary[]; teach: boolean }) {
  return (
    <section aria-labelledby="rooms-h" className="grid snap-start gap-4 py-4">
      <div className="flex items-end justify-between gap-4 px-1 sm:px-3">
        <h2 id="rooms-h" className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase">
          Your classrooms
        </h2>
        {teach && rooms.length ? (
          <Link
            href="/c/new"
            className="caps step inline-flex h-11 shrink-0 items-center gap-2 border border-ink px-4 text-[16px] hover:bg-band"
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            New
          </Link>
        ) : null}
      </div>
      {rooms.length ? (
        <ul className="border-t border-rule">
          {rooms.map((room) => (
            <ClassroomRow key={room.id} room={room} />
          ))}
        </ul>
      ) : teach ? (
        <EmptyState
          title="No classrooms yet"
          action={
            <Link
              href="/c/new"
              className="caps step mt-1 inline-flex h-12 items-center gap-2 bg-ink px-6 text-[17px] text-ground hover:bg-ink-2"
            >
              <Plus size={20} strokeWidth={2} aria-hidden />
              Make a classroom
            </Link>
          }
        />
      ) : null}
    </section>
  );
}

export default async function HomePage() {
  const [profile, rooms] = await Promise.all([requireProfile(), getMyClassrooms()]);
  const teach = canTeach(profile);

  // A trainee with no classrooms only needs the code box. Standing returns with the leaderboard (phase 5).
  return (
    <div className="grid snap-y grid-cols-1 gap-6">
      <h1 className="sr-only">Home</h1>
      {rooms.length || teach ? <Classrooms rooms={rooms} teach={teach} /> : null}
      <Join first={!rooms.length && !teach} />
    </div>
  );
}
