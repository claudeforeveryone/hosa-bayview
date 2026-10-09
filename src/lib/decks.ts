import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/classrooms";

export type DeckSummary = {
  id: string;
  num: number;
  owner_id: string | null;
  owner_name: string;
  classroom_id: string | null;
  classroom_name: string | null;
  title: string;
  description: string;
  is_shared: boolean;
  card_count: number;
  created_at: string;
};

export type Deck = {
  id: string;
  num: number;
  owner_id: string | null;
  classroom_id: string | null;
  title: string;
  description: string;
  is_shared: boolean;
  created_at: string;
};

export type Card = { id: string; position: number; term: string; definition: string };

// Decks you can see: your own, class decks and decks shared to your classrooms. Optionally one classroom.
export async function listDecks(classroomId?: string): Promise<DeckSummary[]> {
  if (classroomId !== undefined && !uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deck_list", { cid: classroomId ?? null });
  if (error) throw new Error(`Decks lookup failed: ${error.message}`);
  return (data ?? []) as DeckSummary[];
}

// Null when malformed or not visible to you.
export const getDeck = cache(async (deckId: string): Promise<Deck | null> => {
  if (!uuid.safeParse(deckId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id, num, owner_id, classroom_id, title, description, is_shared, created_at")
    .eq("id", deckId)
    .maybeSingle();
  if (error) throw new Error(`Deck lookup failed: ${error.message}`);
  return (data as Deck | null) ?? null;
});

export async function getCards(deckId: string): Promise<Card[]> {
  if (!uuid.safeParse(deckId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .select("id, position, term, definition")
    .eq("deck_id", deckId)
    .order("position");
  if (error) throw new Error(`Cards lookup failed: ${error.message}`);
  return (data ?? []) as Card[];
}

// Card ids in this deck whose latest review by you was "still learning". Done in SQL, for you only.
export async function getLearningCardIds(deckId: string): Promise<Set<string>> {
  if (!uuid.safeParse(deckId).success) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_card_ids", { did: deckId });
  if (error) throw new Error(`Reviews lookup failed: ${error.message}`);
  return new Set((data ?? []) as string[]);
}
