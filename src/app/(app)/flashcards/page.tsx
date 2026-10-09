import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { DeckList, newDeckLink } from "@/components/deck-list";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import { listDecks } from "@/lib/decks";

export const metadata: Metadata = { title: "Flashcards" };

export default async function FlashcardsPage() {
  const profile = await requireProfile();
  const decks = await listDecks();
  const mine = decks.filter((d) => d.owner_id === profile.id);
  const others = decks.filter((d) => d.owner_id !== profile.id);

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle>Flashcards</PageTitle>
        {newDeckLink("/flashcards/new")}
      </div>
      {!decks.length ? <EmptyState title="No decks yet" /> : null}
      {mine.length ? (
        <section className="grid gap-4" aria-labelledby="mine-heading">
          <h2 id="mine-heading" className="caps text-[17px] text-ink-2">Yours</h2>
          <DeckList decks={mine} />
        </section>
      ) : null}
      {others.length ? (
        <section className="grid gap-4" aria-labelledby="shared-heading">
          <h2 id="shared-heading" className="caps text-[17px] text-ink-2">Shared with you</h2>
          <DeckList decks={others} />
        </section>
      ) : null}
    </div>
  );
}
