import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { QuestionsEditor } from "@/components/questions-editor";
import { TestForm } from "@/components/test-form";
import { TestPublish } from "@/components/test-publish";
import { getClassroom } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";
import { getQuestions, getTest } from "@/lib/tests";
import { UNTITLED_TEST, isUntitled } from "@/lib/untitled";
import { deleteTest, updateTest } from "../../actions";

export const metadata: Metadata = { title: "Edit test" };

export default async function EditTestPage({
  params,
}: PageProps<"/c/[id]/tests/[testId]/edit">) {
  const { id, testId } = await params;
  const [room, test] = await Promise.all([getClassroom(id), getTest(testId)]);
  if (!room || !test || test.classroom_id !== room.id) notFound();
  if (!room.can_manage) redirect(`/c/${id}/tests/${testId}`);
  const questions = await getQuestions(test.id);

  return (
    <div className="grid grid-cols-1 gap-12">
      <header className="grid gap-3">
        <Link
          href={`/c/${room.id}/tests/${test.id}`}
          className="caps inline-flex items-center gap-1 justify-self-start text-15 text-ink-2 hover:text-ink"
        >
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          Back to test
        </Link>
        <h2 className="font-display text-[clamp(2.25rem,8vw,3.75rem)] leading-[0.95] font-bold [overflow-wrap:anywhere] uppercase">
          {test.title}
        </h2>
        <p className="caps text-16 text-ink-2">
          {formNumber("T", test.num)} · {questions.length} question
          {questions.length === 1 ? "" : "s"} ·{" "}
          {test.is_published ? "Posted" : "Draft"}
        </p>
        <TestPublish testId={test.id} published={test.is_published} />
      </header>

      <QuestionsEditor testId={test.id} questions={questions} />

      <section
        aria-labelledby="details-h"
        className="grid gap-5 border-t border-rule pt-8"
      >
        <h3
          id="details-h"
          className="font-display text-28 leading-none font-bold uppercase"
        >
          Details
        </h3>
        <TestForm
          autoFocusTitle={
            !questions.length && isUntitled(test.title, UNTITLED_TEST)
          }
          action={updateTest.bind(null, test.id)}
          initial={{
            title: test.title,
            description: test.description,
            time_limit: test.time_limit_minutes
              ? String(test.time_limit_minutes)
              : "",
            attempts_allowed: test.attempts_allowed
              ? String(test.attempts_allowed)
              : "",
            shuffle_questions: test.shuffle_questions ? "on" : "",
            shuffle_choices: test.shuffle_choices ? "on" : "",
            allow_practice: test.allow_practice ? "on" : "",
            show_answers: test.show_answers ? "on" : "",
          }}
          submitLabel="Save details"
          pendingLabel="Saving"
        />
      </section>

      <section
        aria-labelledby="delete-h"
        className="grid max-w-xl gap-3 border-t border-rule pt-8"
      >
        <h3
          id="delete-h"
          className="font-display text-28 leading-none font-bold uppercase"
        >
          Delete test
        </h3>
        <p className="text-ink-2">
          Deletes the questions and everyone&rsquo;s attempts. Can&rsquo;t be
          undone.
        </p>
        <ConfirmAction
          action={deleteTest.bind(null, room.id, test.id)}
          label="Delete test"
          confirmLabel="Delete for good"
          pendingLabel="Deleting"
          question={`Delete ${test.title} for everyone?`}
        />
      </section>
    </div>
  );
}
