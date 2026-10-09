import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { DeckCards } from "@/components/deck-cards";
import { DeckForm } from "@/components/deck-form";
import { DeckShare } from "@/components/deck-share";
import { requireProfile } from "@/lib/auth";
import { getClassroom } from "@/lib/classrooms";
import { getCards, getDeck } from "@/lib/decks";
import { formNumber } from "@/lib/join-code";
import { UNTITLED_DECK, isUntitled } from "@/lib/untitled";
import { deleteDeck, updateDeck } from "../actions";

export async function generateMetadata({ params }: PageProps<"/flashcards/[deckId]">): Promise<Metadata> {
  const deck = await getDeck((await params).deckId);
  return { title: deck?.title ?? "Deck" };
}

const studyLink = "caps step inline-flex h-12 items-center bg-ink px-6 text-[17px] text-ground hover:bg-ink-2";
const outlineLink = "caps step inline-flex h-12 items-center border border-ink px-6 text-[17px] hover:bg-band";

export default async function DeckPage({ params }: PageProps<"/flashcards/[deckId]">) {
  const { deckId } = await params;
  const profile = await requireProfile();
  const deck = await getDeck(deckId);
  if (!deck) notFound();
  const [cards, room] = await Promise.all([getCards(deck.id), deck.classroom_id ? getClassroom(deck.classroom_id) : null]);
  const canEdit = deck.owner_id === profile.id || profile.role === "executive" || Boolean(room?.can_manage);
  const privacy = deck.owner_id === profile.id ? "Only you" : "Private";
  const scope = room ? (deck.is_shared ? `Shared with ${room.name}` : `${privacy} · ${room.name}`) : privacy;
  const count = `${cards.length} card${cards.length === 1 ? "" : "s"}`;

  return (
    <div className="grid grid-cols-1 gap-10">
      <header className="grid gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 font-display text-[clamp(2.5rem,9vw,4.5rem)] leading-[0.95] font-bold uppercase [overflow-wrap:anywhere]">
            {deck.title}
          </h1>
          <span className="num caps shrink-0 pt-2 text-[15px] text-ink-2">{formNumber("D", deck.num)}</span>
        </div>
        <p className="caps text-[17px] text-ink-2">
          {count} · {scope}
        </p>
        {deck.description ? <p className="max-w-[65ch] whitespace-pre-line">{deck.description}</p> : null}
        {cards.length ? (
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={`/flashcards/${deck.id}/study`} className={studyLink}>
              Study
            </Link>
            <Link href={`/flashcards/${deck.id}/match`} className={outlineLink}>
              Match
            </Link>
          </div>
        ) : null}
      </header>

      {canEdit ? (
        <section className="grid gap-6 border-t border-rule pt-8" aria-labelledby="edit-heading">
          <h2 id="edit-heading" className="caps text-[17px] text-ink-2">Edit deck</h2>
          <DeckForm
            action={updateDeck.bind(null, deck.id)}
            initial={{ title: deck.title, description: deck.description }}
            autoFocusTitle={cards.length === 0 && isUntitled(deck.title, UNTITLED_DECK)}
            submitLabel="Save deck"
            pendingLabel="Saving"
          />
          {room ? <DeckShare deckId={deck.id} shared={deck.is_shared} classroomName={room.name} /> : null}
          <ConfirmAction
            action={deleteDeck.bind(null, deck.id)}
            label="Delete deck"
            confirmLabel="Delete deck"
            pendingLabel="Deleting"
            question="Delete this deck and all its cards? This can't be undone."
          />
        </section>
      ) : null}

      <section className="grid gap-6 border-t border-rule pt-8" aria-labelledby="cards-heading">
        <h2 id="cards-heading" className="caps text-[17px] text-ink-2">Cards</h2>
        <DeckCards deckId={deck.id} cards={cards} canEdit={canEdit} />
      </section>
    </div>
  );
}
