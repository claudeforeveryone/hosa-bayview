import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { StudySession } from "@/components/study-session";
import { getCards, getDeck, getLearningCardIds } from "@/lib/decks";

export const metadata: Metadata = { title: "Study" };

const toggle = "caps step inline-flex h-11 items-center border px-4 text-16";

export default async function StudyPage({ params, searchParams }: PageProps<"/flashcards/[deckId]/study">) {
  const { deckId } = await params;
  const sp = await searchParams;
  const deck = await getDeck(deckId);
  if (!deck) notFound();
  const cards = await getCards(deck.id);
  const learningOnly = sp.filter === "learning";
  const learning = learningOnly ? await getLearningCardIds(deck.id) : null;
  const pool = learning ? cards.filter((c) => learning.has(c.id)) : cards;
  const back = (
    <Link href={`/flashcards/${deck.id}`} className="caps step inline-flex h-12 items-center border border-ink px-6 text-17 hover:bg-band">
      Back to deck
    </Link>
  );

  return (
    <div className="grid grid-cols-1 gap-8">
      <header className="grid gap-2">
        <h1 className="font-display text-[clamp(2.25rem,8vw,3.5rem)] leading-[0.95] font-bold uppercase [overflow-wrap:anywhere]">
          {deck.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/flashcards/${deck.id}/study`}
            aria-current={learningOnly ? undefined : "page"}
            className={`${toggle} ${learningOnly ? "border-rule-strong text-ink-2 hover:border-ink hover:text-ink" : "border-ink bg-band"}`}
          >
            All cards
          </Link>
          <Link
            href={`/flashcards/${deck.id}/study?filter=learning`}
            aria-current={learningOnly ? "page" : undefined}
            className={`${toggle} ${learningOnly ? "border-ink bg-band" : "border-rule-strong text-ink-2 hover:border-ink hover:text-ink"}`}
          >
            Still learning
          </Link>
        </div>
      </header>

      {!cards.length ? <EmptyState title="No cards yet" action={back} /> : null}
      {cards.length && !pool.length ? <EmptyState title="Nothing still learning" action={back} /> : null}
      {pool.length ? (
        <StudySession
          key={learningOnly ? "learning" : "all"}
          deckId={deck.id}
          cards={pool.map((c) => ({ id: c.id, term: c.term, definition: c.definition }))}
          label={learningOnly ? "Still learning" : "All cards"}
          seed={crypto.randomUUID()}
        />
      ) : null}
    </div>
  );
}
