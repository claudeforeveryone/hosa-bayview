import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { recordMatch } from "@/app/(app)/flashcards/actions";
import { EmptyState } from "@/components/empty-state";
import { MatchGame } from "@/components/match-game";
import { getCards, getDeck } from "@/lib/decks";

export const metadata: Metadata = { title: "Match" };

export default async function MatchPage({ params }: PageProps<"/flashcards/[deckId]/match">) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  if (!deck) notFound();
  const cards = await getCards(deck.id);

  return (
    <div className="grid grid-cols-1 gap-8">
      <header className="grid gap-2">
        <p className="caps text-[17px] text-ink-2">Match</p>
        <h1 className="font-display text-[clamp(2.25rem,8vw,3.5rem)] leading-[0.95] font-bold uppercase [overflow-wrap:anywhere]">
          {deck.title}
        </h1>
      </header>
      {cards.length ? (
        <MatchGame
          deckId={deck.id}
          cards={cards.map((c) => ({
            id: c.id,
            term: c.term,
            definition: c.definition,
          }))}
          seed={crypto.randomUUID()}
          record={recordMatch.bind(null, deck.id)}
        />
      ) : (
        <EmptyState title="No cards yet" />
      )}
    </div>
  );
}
