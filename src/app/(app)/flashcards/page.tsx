import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";

export const metadata: Metadata = { title: "Flashcards" };

export default function FlashcardsPage() {
  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle>Flashcards</PageTitle>
      <EmptyState title="No decks yet" />
    </div>
  );
}
