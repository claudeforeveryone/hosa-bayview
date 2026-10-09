import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { DeckList } from "@/components/deck-list";
import { EmptyState } from "@/components/empty-state";
import { getClassroom } from "@/lib/classrooms";
import { listDecks } from "@/lib/decks";

export default async function FlashcardsTab({ params }: PageProps<"/c/[id]/flashcards">) {
  const { id } = await params;
  const room = await getClassroom(id);
  if (!room) notFound();
  const decks = await listDecks(room.id);

  const newDeck = (
    <Link
      href={`/flashcards/new?classroom=${room.id}`}
      className="caps step inline-flex h-11 shrink-0 items-center gap-2 border border-ink px-4 text-[16px] hover:bg-band"
    >
      {room.can_manage ? "New class deck" : "New deck"}
      <ChevronRight size={18} strokeWidth={2} aria-hidden />
    </Link>
  );

  if (!decks.length) return <EmptyState title="No decks yet" action={newDeck} />;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex justify-end">{newDeck}</div>
      <DeckList decks={decks} />
    </div>
  );
}
