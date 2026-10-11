import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Pencil } from "lucide-react";
import { TestFlagsSection } from "@/components/flag-list";
import { StartTest } from "@/components/start-test";
import { requireProfile } from "@/lib/auth";
import { getClassroom } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";
import { attemptsLeft, scoredMode } from "@/lib/test-settings";
import {
  closeExpired,
  countAttempts,
  getMyAttempts,
  getQuestions,
  getResults,
  getTest,
  getTestFlags,
} from "@/lib/tests";

export async function generateMetadata({
  params,
}: PageProps<"/c/[id]/tests/[testId]">): Promise<Metadata> {
  const test = await getTest((await params).testId);
  return { title: test?.title ?? "Test" };
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const pct = (score: number, total: number) =>
  total ? Math.round((score / total) * 100) : 0;

export default async function TestPage({
  params,
}: PageProps<"/c/[id]/tests/[testId]">) {
  const { id, testId } = await params;
  const [room, test, profile] = await Promise.all([
    getClassroom(id),
    getTest(testId),
    requireProfile(),
  ]);
  if (!room || !test || test.classroom_id !== room.id) notFound();

  await closeExpired(test.id);
  const scored = scoredMode(test.time_limit_minutes);
  const [questions, attempts, results, used, flags] = await Promise.all([
    getQuestions(test.id),
    getMyAttempts(test.id, profile.id),
    room.can_manage ? getResults(test.id) : Promise.resolve([]),
    countAttempts(test.id, profile.id, scored),
    room.can_manage ? getTestFlags(test.id) : Promise.resolve([]),
  ]);
  const left = attemptsLeft(test.attempts_allowed, used);
  const openFlags = flags.filter((f) => f.status === "open");

  return (
    <div className="grid grid-cols-1 gap-10">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="min-w-0 font-display text-[clamp(2.25rem,8vw,3.75rem)] leading-[0.95] font-bold [overflow-wrap:anywhere] uppercase">
            {test.title}
          </h2>
          {room.can_manage ? (
            <Link
              href={`/c/${room.id}/tests/${test.id}/edit`}
              className="caps step inline-flex h-11 shrink-0 items-center gap-2 border border-ink px-4 text-16 hover:bg-band"
            >
              <Pencil size={18} strokeWidth={1.75} aria-hidden />
              Edit
            </Link>
          ) : null}
        </div>
        <p className="caps text-16 text-ink-2">
          {[
            formNumber("T", test.num),
            `${questions.length} question${questions.length === 1 ? "" : "s"}`,
            test.time_limit_minutes
              ? `${test.time_limit_minutes} min`
              : "Practice only",
            test.allow_practice || !test.time_limit_minutes
              ? null
              : "Practice off",
            test.show_answers ? null : "Answers hidden",
            room.can_manage && !test.is_published
              ? "Draft, members can't see it"
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {test.description ? (
          <p className="max-w-[65ch] whitespace-pre-line text-ink-2">
            {test.description}
          </p>
        ) : null}
      </header>

      <StartTest
        classroomId={room.id}
        testId={test.id}
        timeLimit={test.time_limit_minutes}
        hasQuestions={questions.length > 0}
        allowPractice={test.allow_practice}
        attemptsLeft={left}
      />

      {attempts.length ? (
        <section aria-labelledby="mine-h" className="grid gap-3">
          <h3
            id="mine-h"
            className="font-display text-28 leading-none font-bold uppercase"
          >
            Your attempts
          </h3>
          <ul className="border-t border-rule">
            {attempts.map((a) => (
              <li key={a.id} className="border-b border-rule">
                <Link
                  href={`/c/${room.id}/tests/${test.id}/a/${a.id}`}
                  className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-3 hover:bg-band sm:px-3"
                >
                  <span className="min-w-0">
                    <span className="caps block text-16">
                      {a.mode === "timed" ? "Timed" : "Practice"}
                    </span>
                    <span className="num block text-15 text-ink-2">
                      {when(a.started_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {a.score_hidden ? (
                      <span className="caps text-16 text-ink-2">Submitted</span>
                    ) : a.submitted_at ? (
                      <span className="num font-display text-24 font-semibold">
                        {a.score}/{a.total}
                        <span className="ml-2 text-16 text-ink-2">
                          {pct(a.score ?? 0, a.total)}%
                        </span>
                      </span>
                    ) : (
                      <span className="caps border border-rule-strong px-2 py-0.5 text-14 text-ink-2">
                        Keep going
                      </span>
                    )}
                    <ChevronRight
                      size={22}
                      strokeWidth={1.75}
                      className="text-ink-2"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {room.can_manage ? (
        <TestFlagsSection testId={test.id} flags={openFlags} />
      ) : null}

      {room.can_manage ? (
        <section aria-labelledby="results-h" className="grid gap-3">
          <h3
            id="results-h"
            className="font-display text-28 leading-none font-bold uppercase"
          >
            Results
          </h3>
          {results.length ? (
            <table className="w-full border-t border-rule text-left">
              <thead>
                <tr className="caps text-14 text-ink-2">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Name
                  </th>
                  <th
                    scope="col"
                    className="py-2 pr-3 text-right font-semibold"
                  >
                    Best
                  </th>
                  <th
                    scope="col"
                    className="hidden py-2 pr-3 text-right font-semibold sm:table-cell"
                  >
                    Tries
                  </th>
                  <th
                    scope="col"
                    className="hidden py-2 text-right font-semibold sm:table-cell"
                  >
                    Last
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.user_id} className="border-t border-rule">
                    <td className="max-w-0 truncate py-3 pr-3 text-17">
                      <Link
                        href={`/c/${room.id}/tests/${test.id}/people/${r.user_id}`}
                        className="underline decoration-rule-strong hover:decoration-ink"
                      >
                        {r.full_name}
                      </Link>
                      {r.user_id === profile.id ? (
                        <span className="caps ml-2 bg-you px-1.5 py-0.5 text-12 text-on-you">
                          You
                        </span>
                      ) : null}
                    </td>
                    <td className="num py-3 pr-3 text-right font-display text-22 font-semibold whitespace-nowrap">
                      {r.best}/{r.total}
                      {r.practice_only ? (
                        <span className="caps block text-12 font-normal text-ink-2">
                          Practice
                        </span>
                      ) : null}
                    </td>
                    <td className="num hidden py-3 pr-3 text-right sm:table-cell">
                      {r.attempts}
                    </td>
                    <td className="num hidden py-3 text-right text-ink-2 sm:table-cell">
                      {when(r.last_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="border-y border-rule-strong px-1 py-4 text-ink-2">
              No one has finished it yet.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
