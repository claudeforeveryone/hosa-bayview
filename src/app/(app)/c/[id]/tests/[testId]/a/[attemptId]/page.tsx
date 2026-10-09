import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { StartTest } from "@/components/start-test";
import { TakeTest } from "@/components/take-test";
import { requireProfile } from "@/lib/auth";
import { getClassroom } from "@/lib/classrooms";
import { permutation } from "@/lib/shuffle";
import { getAttempt, getSheet, getTest } from "@/lib/tests";
import { serverNow } from "@/lib/time";

export const metadata: Metadata = { title: "Test" };

const LETTERS = "ABCDE";

export default async function AttemptPage({ params }: PageProps<"/c/[id]/tests/[testId]/a/[attemptId]">) {
  const { id, testId, attemptId } = await params;
  const [room, test, attempt, profile] = await Promise.all([
    getClassroom(id),
    getTest(testId),
    getAttempt(attemptId),
    requireProfile(),
  ]);
  if (!room || !test || !attempt || test.classroom_id !== room.id || attempt.test_id !== test.id) notFound();
  const mine = attempt.user_id === profile.id;
  // Trainers can look at finished attempts in their room, never one in progress.
  if (!mine && !attempt.submitted_at) notFound();

  const sheet = await getSheet(attempt.id);
  if (!sheet.length) notFound();

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
          attemptId={attempt.id}
          mode={attempt.mode}
          deadline={attempt.deadline}
          serverNow={serverNow()}
          rows={sheet}
        />
      </div>
    );
  }

  const score = attempt.score ?? 0;
  const pct = attempt.total ? Math.round((score / attempt.total) * 100) : 0;
  const order = permutation(sheet.length, attempt.id);

  return (
    <div className="grid grid-cols-1 gap-10">
      <header className="grid gap-3">
        {back}
        <p className="caps text-[16px] text-ink-2">{attempt.mode === "timed" ? "Timed" : "Practice"} · Done</p>
        <p className="num font-display text-[clamp(4rem,18vw,8rem)] leading-[0.85] font-bold">
          {score}/{attempt.total}
        </p>
        <p className="num caps text-[20px]">{pct}%</p>
        {mine ? (
          <div className="pt-2">
            <StartTest classroomId={room.id} testId={test.id} timeLimit={test.time_limit_minutes} hasQuestions />
          </div>
        ) : null}
      </header>

      <section aria-labelledby="review-h" className="grid gap-4">
        <h2 id="review-h" className="font-display text-[28px] leading-none font-bold uppercase">
          Review
        </h2>
        <ol className="border-t border-rule">
          {order.map((index, n) => {
            const q = sheet[index];
            const choices = permutation(q.options.length, `${attempt.id}:${q.question_id}`);
            const verdict = q.selected_index === null ? "Blank" : q.is_correct ? "Right" : "Wrong";
            return (
              <li key={q.question_id} className="grid gap-3 border-b border-rule py-5">
                <div className="flex items-start gap-3">
                  <span className="num w-8 shrink-0 font-display text-[22px] leading-tight font-semibold text-ink-2">{n + 1}</span>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p
                      className={`caps text-[14px] ${verdict === "Right" ? "text-ok" : verdict === "Wrong" ? "text-danger" : "text-ink-2"}`}
                    >
                      {verdict}
                    </p>
                    <p className="text-[17px] whitespace-pre-line">{q.prompt}</p>
                  </div>
                </div>
                <ul className="grid gap-1 pl-11">
                  {choices.map((original, shown) => {
                    const right = q.correct_index === original;
                    const picked = q.selected_index === original;
                    return (
                      <li
                        key={original}
                        className={`flex items-start gap-2 px-2 py-1 text-[16px] ${
                          right ? "bg-ok/15 font-medium" : picked ? "bg-danger/10" : "text-ink-2"
                        }`}
                      >
                        <span className="num w-5 shrink-0 font-semibold">{LETTERS[shown]}</span>
                        <span className="min-w-0 flex-1">{q.options[original]}</span>
                        {right ? <Check size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-ok" aria-label="Right answer" /> : null}
                        {picked && !right ? (
                          <X size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-danger" aria-label={mine ? "Your answer" : "Their answer"} />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {q.explanation ? <p className="pl-11 text-[15px] text-ink-2">{q.explanation}</p> : null}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
