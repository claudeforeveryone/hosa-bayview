import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getClassroom, uuid } from "@/lib/classrooms";
import { getMyAttempts, getResults, getTest } from "@/lib/tests";

export const metadata: Metadata = { title: "Member results" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// A trainer's view of one member on one test: every finished attempt, each opening its answer review.
export default async function MemberResultsPage({
  params,
}: PageProps<"/c/[id]/tests/[testId]/people/[userId]">) {
  const { id, testId, userId } = await params;
  if (!uuid.safeParse(userId).success) notFound();
  const [room, test] = await Promise.all([
    getClassroom(id),
    getTest(testId),
    requireProfile(),
  ]);
  if (!room || !test || test.classroom_id !== room.id) notFound();
  if (!room.can_manage) notFound();

  const [attempts, results] = await Promise.all([
    getMyAttempts(test.id, userId),
    getResults(test.id),
  ]);
  const name = results.find((r) => r.user_id === userId)?.full_name;
  if (!name) notFound();
  const finished = attempts.filter((a) => a.submitted_at);

  return (
    <div className="grid grid-cols-1 gap-8">
      <header className="grid gap-3">
        <Link
          href={`/c/${room.id}/tests/${test.id}`}
          className="caps inline-flex items-center gap-1 justify-self-start text-15 text-ink-2 hover:text-ink"
        >
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          {test.title}
        </Link>
        <h2 className="font-display text-[clamp(2.25rem,8vw,3.75rem)] leading-[0.95] font-bold [overflow-wrap:anywhere] uppercase">
          {name}
        </h2>
        <p className="caps text-16 text-ink-2">
          {finished.length} finished attempt{finished.length === 1 ? "" : "s"}
        </p>
      </header>

      {finished.length ? (
        <ul className="border-t border-rule">
          {finished.map((a) => {
            const pct = a.total
              ? Math.round(((a.score ?? 0) / a.total) * 100)
              : 0;
            return (
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
                      {when(a.submitted_at ?? a.started_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="num font-display text-24 font-semibold">
                      {a.score}/{a.total}
                      <span className="ml-2 text-16 text-ink-2">
                        {pct}%
                      </span>
                    </span>
                    <ChevronRight
                      size={22}
                      strokeWidth={1.75}
                      className="text-ink-2"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-y border-rule-strong px-1 py-4 text-ink-2">
          No finished attempts yet.
        </p>
      )}
    </div>
  );
}
