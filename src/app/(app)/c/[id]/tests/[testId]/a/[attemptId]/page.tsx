import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReviewItem } from "@/components/review-item";
import { StartTest } from "@/components/start-test";
import { TakeTest } from "@/components/take-test";
import type { DeckOption } from "@/components/selection-cards";
import { requireProfile } from "@/lib/auth";
import { getClassroom } from "@/lib/classrooms";
import { listDecks } from "@/lib/decks";
import { attemptsLeft, HIDDEN_SCORE_NOTE, scoredMode } from "@/lib/test-settings";
import {
  countAttempts,
  getAttempt,
  getAttemptQuestions,
  getTest,
  getTestFlags,
} from "@/lib/tests";
import { serverNow } from "@/lib/time";

export const metadata: Metadata = { title: "Test" };

export default async function AttemptPage({
  params,
}: PageProps<"/c/[id]/tests/[testId]/a/[attemptId]">) {
  const { id, testId, attemptId } = await params;
  const [room, test, attempt, profile] = await Promise.all([
    getClassroom(id),
    getTest(testId),
    getAttempt(attemptId),
    requireProfile(),
  ]);
  if (
    !room ||
    !test ||
    !attempt ||
    test.classroom_id !== room.id ||
    attempt.test_id !== test.id
  )
    notFound();
  const mine = attempt.user_id === profile.id;
  // Trainers can look at finished attempts in their room, never one in progress.
  if (!mine && !attempt.submitted_at) notFound();

  const sheet = await getAttemptQuestions(attempt.id);
  if (!sheet.length) notFound();

  // Takers only: the decks they can add to, and their own Ask teacher flags on this test.
  const decks: DeckOption[] = mine
    ? (await listDecks())
        .filter((d) => d.owner_id === profile.id)
        .map((d) => ({ id: d.id, title: d.title }))
    : [];
  // getTestFlags returns every member's flags to trainers, so keep only this taker's own.
  const flags = mine
    ? (await getTestFlags(test.id)).filter((f) => f.user_id === profile.id)
    : [];
  const flagByQuestion = Object.fromEntries(
    flags.map((f) => [
      f.question_id,
      {
        id: f.id,
        note: f.note,
        status: f.status,
        reply: f.reply,
        reason: f.reason,
      },
    ]),
  );

  const back = (
    <Link
      href={`/c/${room.id}/tests/${test.id}`}
      className="caps inline-flex items-center gap-1 justify-self-start text-[15px] text-ink-2 hover:text-ink"
    >
      <ArrowLeft size={16} strokeWidth={2} aria-hidden />
      {test.title}
    </Link>
  );

  if (!attempt.submitted_at) {
    return (
      <div className="grid grid-cols-1 gap-4">
        {back}
        <TakeTest
          key={attempt.id}
          testId={test.id}
          attemptId={attempt.id}
          mode={attempt.mode}
          deadline={attempt.deadline}
          serverNow={serverNow()}
          rows={sheet}
          decks={decks}
          flags={flagByQuestion}
        />
      </div>
    );
  }

  const score = attempt.score ?? 0;
  const pct = attempt.total ? Math.round((score / attempt.total) * 100) : 0;
  const used = mine
    ? await countAttempts(
        test.id,
        profile.id,
        scoredMode(test.time_limit_minutes),
      )
    : 0;
  const left = attemptsLeft(test.attempts_allowed, used);

  return (
    <div className="grid grid-cols-1 gap-10">
      <header className="grid gap-3">
        {back}
        <p className="caps text-[16px] text-ink-2">
          {attempt.mode === "timed" ? "Timed" : "Practice"} · Done
        </p>
        {attempt.score_hidden ? (
          <>
            <p className="font-display text-[clamp(3rem,14vw,6rem)] leading-[0.85] font-bold uppercase">
              Submitted
            </p>
            <p className="max-w-[60ch] text-[17px] text-ink-2">
              {HIDDEN_SCORE_NOTE}
            </p>
          </>
        ) : (
          <>
            <p className="num font-display text-[clamp(4rem,18vw,8rem)] leading-[0.85] font-bold">
              {score}/{attempt.total}
            </p>
            <p className="num caps text-[20px]">{pct}%</p>
          </>
        )}
        {mine ? (
          <div className="pt-2">
            <StartTest
              classroomId={room.id}
              testId={test.id}
              timeLimit={test.time_limit_minutes}
              hasQuestions
              allowPractice={test.allow_practice}
              attemptsLeft={left}
            />
          </div>
        ) : null}
      </header>

      <section aria-labelledby="review-h" className="grid gap-4">
        <h2
          id="review-h"
          className="font-display text-[28px] leading-none font-bold uppercase"
        >
          Review
        </h2>
        {mine && !test.show_answers ? (
          <p className="text-ink-2">
            The trainer has turned off the answers for this test.
          </p>
        ) : null}
        <ol className="border-t border-rule">
          {sheet.map((q) => (
            <ReviewItem
              key={q.question_id}
              q={q}
              mine={mine}
              testId={test.id}
              decks={decks}
              flag={flagByQuestion[q.question_id] ?? null}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}
