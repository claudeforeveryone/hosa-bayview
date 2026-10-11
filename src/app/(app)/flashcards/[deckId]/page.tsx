import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { CopyDeck } from "@/components/copy-deck";
import { DeckCards } from "@/components/deck-cards";
import { DeckForm } from "@/components/deck-form";
import { DeckRoom } from "@/components/deck-room";
import { DeckShare } from "@/components/deck-share";
import { requireProfile } from "@/lib/auth";
import { getClassroom, getMyClassrooms } from "@/lib/classrooms";
import { getCards, getDeck, getDeckOwnerName, getMyBestMs, getTopTimes, type TopTime } from "@/lib/decks";
import { formNumber } from "@/lib/join-code";
import { formatMatchTime, standardRound } from "@/lib/match-times";
import { UNTITLED_DECK, isUntitled } from "@/lib/untitled";
import { deleteDeck, updateDeck } from "../actions";

export async function generateMetadata({ params }: PageProps<"/flashcards/[deckId]">): Promise<Metadata> {
  const deck = await getDeck((await params).deckId);
  return { title: deck?.title ?? "Deck" };
}

const studyLink = "caps step inline-flex h-12 items-center bg-ink px-6 text-17 text-ground hover:bg-ink-2";
const outlineLink = "caps step inline-flex h-12 items-center border border-ink px-6 text-17 hover:bg-band";

export default async function DeckPage({ params }: PageProps<"/flashcards/[deckId]">) {
  const { deckId } = await params;
  const profile = await requireProfile();
  const deck = await getDeck(deckId);
  if (!deck) notFound();
  const topFromClass = Boolean(deck.classroom_id && deck.is_shared);
  const cards = await getCards(deck.id);
  const [room, best, top, ownerName, myRooms] = await Promise.all([
    deck.classroom_id ? getClassroom(deck.classroom_id) : null,
    getMyBestMs(deck.id, standardRound(cards.length)),
    topFromClass ? getTopTimes(deck.id) : Promise.resolve<TopTime[]>([]),
    deck.owner_id === profile.id ? Promise.resolve(null) : getDeckOwnerName(deck.id),
    deck.owner_id === profile.id ? getMyClassrooms().catch(() => []) : Promise.resolve([]),
  ]);
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
          <span className="num caps shrink-0 pt-2 text-15 text-ink-2">{formNumber("D", deck.num)}</span>
        </div>
        <p className="caps text-17 text-ink-2">
          {count} · {scope}
        </p>
        {!canEdit && ownerName ? <p className="text-15 text-ink-2">Shared by {ownerName}</p> : null}
        {deck.description ? <p className="max-w-[65ch] whitespace-pre-line">{deck.description}</p> : null}
        {cards.length || !canEdit ? (
          <div className="flex flex-wrap items-start gap-3 pt-2">
            {cards.length ? (
              <>
                <Link href={`/flashcards/${deck.id}/study`} className={studyLink}>
                  Study
                </Link>
                <Link href={`/flashcards/${deck.id}/match`} className={outlineLink}>
                  Match
                </Link>
              </>
            ) : null}
            {canEdit ? null : <CopyDeck deckId={deck.id} />}
          </div>
        ) : null}
        {cards.length ? (
          <p className="caps text-17 text-ink-2">
            Best match <span className="num text-ink">{best === null ? "none yet" : formatMatchTime(best)}</span>
          </p>
        ) : null}
      </header>

      {top.length ? (
        <section className="grid gap-4 border-t border-rule pt-8" aria-labelledby="top-heading">
          <h2 id="top-heading" className="caps text-17 text-ink-2">
            Fastest matches
          </h2>
          <ol className="border-t border-rule">
            {top.map((t, i) => (
              <li
                key={`${i}-${t.user_name}`}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-3 text-17"
              >
                <span className="num text-ink-2">{i + 1}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{t.user_name}</span>
                  {t.is_you ? (
                    <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-13 leading-none text-on-you">You</span>
                  ) : null}
                </span>
                <span className="num">{formatMatchTime(t.time_ms)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {canEdit ? (
        <section className="grid gap-6 border-t border-rule pt-8" aria-labelledby="edit-heading">
          <h2 id="edit-heading" className="caps text-17 text-ink-2">
            Edit deck
          </h2>
          <DeckForm
            action={updateDeck.bind(null, deck.id)}
            initial={{ title: deck.title, description: deck.description }}
            autoFocusTitle={cards.length === 0 && isUntitled(deck.title, UNTITLED_DECK)}
            submitLabel="Save deck"
            pendingLabel="Saving"
          />
          {deck.owner_id === profile.id && (myRooms.length || deck.classroom_id) ? (
            <DeckRoom
              deckId={deck.id}
              current={deck.classroom_id}
              rooms={[
                ...(room && !myRooms.some((r) => r.id === room.id) ? [{ id: room.id, name: room.name }] : []),
                ...myRooms.map((r) => ({ id: r.id, name: r.name })),
              ]}
            />
          ) : null}
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
        <h2 id="cards-heading" className="caps text-17 text-ink-2">
          Cards
        </h2>
        <DeckCards deckId={deck.id} cards={cards} canEdit={canEdit} />
      </section>
    </div>
  );
}
