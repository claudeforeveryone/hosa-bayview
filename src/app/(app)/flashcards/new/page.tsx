import type { Metadata } from "next";
import { DeckForm } from "@/components/deck-form";
import { requireProfile } from "@/lib/auth";
import { getMyClassrooms } from "@/lib/classrooms";
import { createDeck } from "../actions";

export const metadata: Metadata = { title: "New deck" };

export default async function NewDeckPage({ searchParams }: PageProps<"/flashcards/new">) {
  await requireProfile();
  const [rooms, sp] = await Promise.all([getMyClassrooms(), searchParams]);
  const preset = typeof sp.classroom === "string" ? sp.classroom : "";
  const room = rooms.find((r) => r.id === preset);

  return (
    <div className="grid grid-cols-1 gap-8">
      <h1 className="font-display text-[clamp(2.5rem,9vw,4rem)] leading-none font-bold uppercase">New deck</h1>
      <DeckForm
        action={createDeck}
        classrooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
        initial={{ title: "", description: "", classroom_id: room?.id ?? "", is_shared: Boolean(room?.can_manage) }}
        submitLabel="Make deck"
        pendingLabel="Making it"
      />
    </div>
  );
}
