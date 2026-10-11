import type { Metadata } from "next";
import Link from "next/link";
import { CareerQuiz } from "@/components/career-quiz";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import {
  CAREER_FILTER_LABEL,
  parseCareerFilter,
  starredIds,
} from "@/lib/career";
import { getCareerItems } from "@/lib/career-data";
import {
  practiceItems,
  quizQuestions,
  type QuizSize,
} from "@/lib/career-practice";

export const metadata: Metadata = { title: "Quiz" };

// A quiz over questions you've already answered. The set and size come from the URL; the questions and the
// random pick are made here, and every answer is checked on the server as it's given.
export default async function CareerQuizPage(props: PageProps<"/career/quiz">) {
  const [sp, profile] = await Promise.all([
    props.searchParams,
    requireProfile(),
  ]);
  const set = parseCareerFilter(sp.set);
  const size: QuizSize = sp.size === "complete" ? "complete" : "quick";
  const rows = await getCareerItems(profile.id);
  const pool = practiceItems(rows, set, starredIds(rows));
  const items = quizQuestions(pool, size);
  const title = size === "complete" ? "Full quiz" : "Quick quiz";
  const again = `/career/quiz?set=${set}&size=${size}&run=${crypto.randomUUID()}`;
  const back = (
    <Link
      href="/career"
      className="caps step inline-flex h-12 items-center border border-ink px-6 text-[17px] hover:bg-band"
    >
      Back to Career
    </Link>
  );

  return (
    <div className="grid max-w-3xl gap-8">
      <PageTitle
        meta={
          pool.length
            ? `${CAREER_FILTER_LABEL[set]} · ${items.length} of ${pool.length} questions`
            : CAREER_FILTER_LABEL[set]
        }
      >
        {title}
      </PageTitle>
      {pool.length ? (
        <CareerQuiz
          key={typeof sp.run === "string" ? sp.run : "first"}
          since={new Date().toISOString()}
          items={items.map((r) => ({
            question_id: r.question_id as string,
            prompt: r.prompt,
            options: r.options,
          }))}
          againHref={again}
          backHref="/career"
        />
      ) : (
        <EmptyState title="Nothing to quiz yet" action={back}>
          Answer a few questions first, or pick another set. Questions whose
          answers your trainer hides don&apos;t count.
        </EmptyState>
      )}
    </div>
  );
}
