import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Layers,
  Lock,
  Play,
  Plus,
  Timer,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { JoinForm } from "@/components/join-form";
import { PageTitle } from "@/components/page-title";
import { canTeach, requireProfile } from "@/lib/auth";
import { RECENT_ROOMS_COOKIE, parseRecentRooms } from "@/lib/classroom-tabs";
import { getMyClassrooms, type ClassroomSummary } from "@/lib/classrooms";
import { listDecks, type DeckSummary } from "@/lib/decks";
import { formNumber } from "@/lib/join-code";
import { questionsLocked } from "@/lib/nav-items";
import {
  minutesLeft,
  orderRooms,
  unfinished,
  type HubAttempt,
} from "@/lib/questions-hub";
import { createClient } from "@/lib/supabase/server";
import { getClassroomTests, type TestSummary } from "@/lib/tests";
import { timeAgo } from "@/lib/when";

export const metadata: Metadata = { title: "Questions" };

// An executive can list every room; the hub keeps to the ones they work in, and caps the rest.
const EXEC_ROOM_CAP = 12;
const DECKS_SHOWN = 4;
const RESUME_SHOWN = 3;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function myMemberIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classroom_members")
    .select("classroom_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.classroom_id as string));
}

async function myAttempts(userId: string): Promise<HubAttempt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attempt_list", { p_user: userId });
  if (error) throw new Error(`Attempts lookup failed: ${error.message}`);
  return (data ?? []) as HubAttempt[];
}

// Not in an event yet: say what opens it, and put the way in right here.
function Locked({ teach }: { teach: boolean }) {
  return (
    <section
      aria-labelledby="locked-h"
      className="grid border-[3px] border-ink"
    >
      <div className="grid gap-3 px-4 py-6 sm:px-6">
        <Lock size={32} strokeWidth={1.75} aria-hidden />
        <h2
          id="locked-h"
          className="font-display text-[clamp(1.8rem,6vw,2.6rem)] leading-none font-bold uppercase"
        >
          Join an event to unlock
        </h2>
        <p className="max-w-[60ch] text-17 text-ink-2">
          Questions holds the tests and flashcards from your events, and keeps
          your place in any test you&apos;ve started. It opens once you&apos;re
          in an event.
        </p>
      </div>
      <div className="grid gap-4 border-t-[3px] border-ink bg-field px-4 py-6 text-on-field sm:px-6">
        {teach ? (
          <Link
            href="/c/new"
            className="caps step press inline-flex h-14 items-center justify-between gap-3 border-2 border-on-field px-4 text-17 hover:bg-field-2 sm:max-w-sm"
          >
            Make an event
            <Plus size={20} strokeWidth={2} aria-hidden />
          </Link>
        ) : null}
        <JoinForm />
      </div>
    </section>
  );
}

type Room = ClassroomSummary & { tests: TestSummary[]; decks: DeckSummary[] };

// One run you can pick back up: the whole row is the door.
function ResumeRow({
  href,
  test,
  room,
  mode,
  deadline,
  startedAt,
  now,
}: {
  href: string;
  test: string;
  room: string;
  mode: string;
  deadline: string | null;
  startedAt: string;
  now: number;
}) {
  const left = minutesLeft(deadline, now);
  const timed = mode === "timed";
  return (
    <li className="border-b-2 border-ink last:border-b-0">
      <Link
        href={href}
        className="step group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-3 py-4 hover:bg-band sm:px-4"
      >
        <span className="grid min-w-0 gap-1">
          <span className="truncate font-display text-[clamp(1.4rem,5vw,1.9rem)] leading-none font-bold uppercase">
            {test}
          </span>
          <span className="caps num flex flex-wrap items-center gap-x-2 text-14 text-ink-2">
            <span className="truncate">{room}</span>
            <span aria-hidden>·</span>
            <span>
              {timed
                ? `Timed · ${left === 1 ? "1 min" : `${left} min`} left`
                : `Practice · started ${timeAgo(startedAt, now)}`}
            </span>
          </span>
        </span>
        <span
          className={`caps press inline-flex h-12 items-center gap-2 px-4 text-16 font-semibold ${
            timed ? "bg-danger text-ground" : "bg-ink text-ground"
          }`}
        >
          {timed ? (
            <Timer size={18} strokeWidth={2} aria-hidden />
          ) : (
            <Play size={18} strokeWidth={2} aria-hidden />
          )}
          Resume
        </span>
      </Link>
    </li>
  );
}

function TestRow({
  roomId,
  t,
  manager,
  open,
}: {
  roomId: string;
  t: TestSummary;
  manager: boolean;
  open: boolean;
}) {
  const meta = [
    plural(t.question_count, "question"),
    t.time_limit_minutes ? `${t.time_limit_minutes} min` : "Practice",
    manager && !t.is_published ? "Draft" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="border-b border-rule last:border-b-0">
      <Link
        href={`/c/${roomId}/tests/${t.id}`}
        className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 hover:bg-band sm:px-4"
      >
        <span className="min-w-0">
          <span className="block truncate text-18 font-semibold">{t.title}</span>
          <span className="caps num block truncate text-14 text-ink-2">{meta}</span>
        </span>
        <span className="flex items-center gap-2">
          {open ? (
            <span className="caps bg-you px-2 py-1 text-13 leading-none text-on-you">
              In progress
            </span>
          ) : t.my_best !== null && t.my_best_total ? (
            <span className="num font-display text-22 font-bold">
              {t.my_best}/{t.my_best_total}
            </span>
          ) : (
            <span className="caps text-13 text-ink-2">New</span>
          )}
          <ChevronRight size={20} strokeWidth={2} aria-hidden className="text-ink-2" />
        </span>
      </Link>
    </li>
  );
}

function RoomSection({ room, openTests }: { room: Room; openTests: Set<string> }) {
  const showcase = room.category === "showcase";
  const id = `q-${room.id}`;
  return (
    <section aria-labelledby={`${id}-h`} id={id} className="grid scroll-mt-4 border-[3px] border-ink">
      <div className="flex min-h-14 items-center justify-between gap-3 bg-field px-3 py-2 text-on-field sm:px-4">
        <h2
          id={`${id}-h`}
          className="min-w-0 truncate font-display text-[clamp(1.4rem,5vw,1.9rem)] leading-none font-bold uppercase"
        >
          {room.name}
        </h2>
        <Link
          href={`/c/${room.id}`}
          className="caps step inline-flex h-11 shrink-0 items-center gap-1.5 text-14 underline-offset-4 hover:underline"
        >
          <span className="num">{formNumber("C", room.num)}</span>
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>

      {showcase ? null : (
        <div className="grid">
          <h3 className="caps flex items-center justify-between border-b-2 border-ink px-3 py-2 text-15 font-semibold sm:px-4">
            Tests
            <span className="num text-ink-2">{room.tests.length}</span>
          </h3>
          {room.tests.length ? (
            <ul>
              {room.tests.map((t) => (
                <TestRow
                  key={t.id}
                  roomId={room.id}
                  t={t}
                  manager={room.can_manage}
                  open={openTests.has(t.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-16 text-ink-2 sm:px-4">
              {room.can_manage ? (
                <Link href={`/c/${room.id}/tests`} className="underline underline-offset-4">
                  Add the first test
                </Link>
              ) : (
                "No tests yet. Your trainer adds them here."
              )}
            </p>
          )}
        </div>
      )}

      <div className={`grid ${showcase ? "" : "border-t-[3px] border-ink"}`}>
        <h3 className="caps flex items-center justify-between border-b-2 border-ink px-3 py-2 text-15 font-semibold sm:px-4">
          Cards
          <span className="num text-ink-2">{room.decks.length}</span>
        </h3>
        {room.decks.length ? (
          <ul>
            {room.decks.slice(0, DECKS_SHOWN).map((d) => (
              <li key={d.id} className="border-b border-rule last:border-b-0">
                <Link
                  href={`/flashcards/${d.id}`}
                  className="step grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 hover:bg-band sm:px-4"
                >
                  <Layers size={20} strokeWidth={1.75} aria-hidden className="text-ink-2" />
                  <span className="min-w-0">
                    <span className="block truncate text-18 font-semibold">{d.title}</span>
                    <span className="caps num block text-14 text-ink-2">
                      {plural(d.card_count, "card")}
                    </span>
                  </span>
                  <ChevronRight size={20} strokeWidth={2} aria-hidden className="text-ink-2" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-4 text-16 text-ink-2 sm:px-4">No decks yet.</p>
        )}
        <Link
          href={`/c/${room.id}/flashcards`}
          className="caps step flex min-h-12 items-center justify-between gap-2 border-t-2 border-ink px-3 text-15 hover:bg-band sm:px-4"
        >
          {room.decks.length > DECKS_SHOWN ? `All ${room.decks.length} decks` : "Cards in this event"}
          <ArrowRight size={18} strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

// Every test and deck from your events in one place, with any test you started at the top so it's one tap
// back in. Answers save as you go (the server keeps them), so leaving mid-test loses nothing.
export default async function QuestionsPage() {
  const [profile, rooms, jar] = await Promise.all([
    requireProfile(),
    getMyClassrooms(),
    cookies(),
  ]);
  const teach = canTeach(profile);

  if (questionsLocked(rooms.length)) {
    return (
      <div className="grid max-w-3xl grid-cols-1 gap-8">
        <PageTitle meta="Tests and flashcards from your events">Questions</PageTitle>
        <Locked teach={teach} />
      </div>
    );
  }

  const recent = parseRecentRooms(jar.get(RECENT_ROOMS_COOKIE)?.value);
  let picked = rooms;
  if (profile.role === "executive") {
    const member = await myMemberIds(profile.id);
    const mine = rooms.filter((r) => r.is_owner || member.has(r.id) || recent.includes(r.id));
    picked = mine.length ? mine : rooms;
  }
  const ordered = orderRooms(picked, recent).slice(0, EXEC_ROOM_CAP);

  const [tests, decks, attempts] = await Promise.all([
    Promise.all(ordered.map((r) => getClassroomTests(r.id).catch(() => [] as TestSummary[]))),
    listDecks().catch(() => [] as DeckSummary[]),
    myAttempts(profile.id).catch(() => [] as HubAttempt[]),
  ]);
  const withContent: Room[] = ordered.map((r, i) => ({
    ...r,
    tests: tests[i],
    decks: decks.filter((d) => d.classroom_id === r.id),
  }));

  const testInfo = new Map<string, { title: string; room: Room }>();
  for (const r of withContent) for (const t of r.tests) testInfo.set(t.id, { title: t.title, room: r });
  // eslint-disable-next-line react-hooks/purity -- server render time, once per request
  const now = Date.now();
  const open = unfinished(attempts, new Set(testInfo.keys()), now);
  const openTests = new Set(open.map((a) => a.test_id));
  const resumeRow = (a: HubAttempt) => {
    const info = testInfo.get(a.test_id)!;
    return (
      <ResumeRow
        key={a.id}
        href={`/c/${info.room.id}/tests/${a.test_id}/a/${a.id}`}
        test={info.title}
        room={info.room.name}
        mode={a.mode}
        deadline={a.deadline}
        startedAt={a.started_at}
        now={now}
      />
    );
  };
  const ownDecks = decks.filter((d) => d.classroom_id === null && d.owner_id === profile.id);

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-8">
      <PageTitle meta="Tests and flashcards from your events">Questions</PageTitle>

      {open.length ? (
        <section aria-labelledby="resume-h" className="grid border-[3px] border-ink">
          <div className="bg-ink px-3 py-3 text-ground sm:px-4">
            <h2
              id="resume-h"
              className="font-display text-[clamp(1.5rem,5vw,2rem)] leading-none font-bold uppercase"
            >
              Pick up where you left off
            </h2>
            <p className="mt-1 text-15 opacity-80">Your answers are saved. You&apos;ll land on the next one.</p>
          </div>
          <ul>{open.slice(0, RESUME_SHOWN).map(resumeRow)}</ul>
          {open.length > RESUME_SHOWN ? (
            // A Career quiz opens a practice run on each test it draws from, so older open runs can pile up.
            <details className="group border-t-2 border-ink">
              <summary className="caps step flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-15 hover:bg-band sm:px-4 [&::-webkit-details-marker]:hidden">
                {open.length - RESUME_SHOWN} more started
                <ChevronDown size={18} strokeWidth={2} aria-hidden className="group-open:rotate-180" />
              </summary>
              <ul className="border-t-2 border-ink">{open.slice(RESUME_SHOWN).map(resumeRow)}</ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {withContent.length > 1 ? (
        <nav aria-label="Jump to an event" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2 sm:flex-wrap">
            {withContent.map((r) => (
              <li key={r.id} className="shrink-0">
                <a
                  href={`#q-${r.id}`}
                  className="caps step inline-flex h-11 items-center border-2 border-ink px-3 text-14 hover:bg-band"
                >
                  {r.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {withContent.map((r) => (
        <RoomSection key={r.id} room={r} openTests={openTests} />
      ))}

      {picked.length > ordered.length ? (
        <p className="text-16 text-ink-2">
          Showing {ordered.length} of {picked.length} events.{" "}
          <Link href="/events?all=1" className="text-ink underline underline-offset-4">
            All events
          </Link>
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/flashcards"
          className="step grid gap-1 border-2 border-ink p-4 hover:bg-band"
        >
          <span className="caps text-17 font-semibold">Your own decks</span>
          <span className="text-15 text-ink-2">
            {ownDecks.length ? plural(ownDecks.length, "deck") : "Make a deck of your own"}
          </span>
        </Link>
        <Link
          href="/career"
          className="step grid gap-1 border-2 border-ink p-4 hover:bg-band"
        >
          <span className="caps text-17 font-semibold">Quiz yourself</span>
          <span className="text-15 text-ink-2">On questions you&apos;ve already answered</span>
        </Link>
      </div>

      {!withContent.some((r) => r.tests.length || r.decks.length) ? (
        <EmptyState title="Nothing to study yet">
          Tests and decks your trainers add to your events show up here.
        </EmptyState>
      ) : null}
    </div>
  );
}
