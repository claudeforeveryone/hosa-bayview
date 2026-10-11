import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { StudySession } from "@/components/study-session";
import { requireProfile } from "@/lib/auth";
import {
  CAREER_FILTER_LABEL,
  parseCareerFilter,
  starredIds,
} from "@/lib/career";
import { getCareerItems } from "@/lib/career-data";
import { flashcardsFrom, practiceItems } from "@/lib/career-practice";

export const metadata: Metadata = { title: "Flashcards" };

// Flashcards from questions you've answered: the question is the term, the right option the definition.
// Marks stay on this screen (persist false); no deck is written.
export default async function CareerFlashcardsPage(
  props: PageProps<"/career/flashcards">,
) {
  const [sp, profile] = await Promise.all([
    props.searchParams,
    requireProfile(),
  ]);
  const set = parseCareerFilter(sp.set);
  const rows = await getCareerItems(profile.id);
  const cards = flashcardsFrom(practiceItems(rows, set, starredIds(rows)));
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
        meta={`${CAREER_FILTER_LABEL[set]} · ${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
      >
        Flashcards
      </PageTitle>
      {cards.length ? (
        <StudySession
          deckId="career"
          cards={cards.map((c) => ({
            id: c.id,
            term: c.term,
            definition: c.definition,
          }))}
          label={CAREER_FILTER_LABEL[set]}
          seed={crypto.randomUUID()}
          persist={false}
          backHref="/career"
          backLabel="Back to Career"
        />
      ) : (
        <EmptyState title="No cards yet" action={back}>
          Answer a few questions first, or pick another set. Questions whose
          answers your trainer hides don&apos;t count.
        </EmptyState>
      )}
    </div>
  );
}
