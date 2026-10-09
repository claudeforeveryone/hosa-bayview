"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireProfile } from "@/lib/auth";
import {
  DEFINITION_MAX,
  MAX_CARDS_PER_PASTE,
  TERM_MAX,
} from "@/lib/parse/cards";
import { UNTITLED_DECK } from "@/lib/untitled";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues)
    out[String(issue.path[0])] ??= issue.message;
  return out;
}

function failed(where: string, message: string): FormState {
  console.error(`[flashcards:${where}]`, message);
  return { error: "That didn't save. Try again." };
}

const deckFields = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give it a title.")
    .max(120, "Keep the title under 120 characters."),
  description: z
    .string()
    .trim()
    .max(1000, "Keep the description under 1000 characters."),
});

function readDeck(form: FormData) {
  const values = {
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? "").replace(/\r\n?/g, "\n"),
    classroom_id: String(form.get("classroom_id") ?? ""),
    shared: form.get("shared") === "on" ? "on" : "",
  };
  return { values, parsed: deckFields.safeParse(values) };
}

export async function createDeck(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const { values, parsed } = readDeck(form);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };
  const classroom =
    values.classroom_id && id.safeParse(values.classroom_id).success
      ? values.classroom_id
      : null;
  if (values.classroom_id && !classroom)
    return { error: "That classroom doesn't exist.", values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      classroom_id: classroom,
      is_shared: Boolean(classroom && values.shared),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501")
      return { error: "You can't share a deck to that classroom.", values };
    return { ...failed("create", error.message), values };
  }
  redirect(`/flashcards/${data.id}`);
}

// One tap from Flashcards: a personal blank deck, straight into its page with the title ready to rename.
export async function createBlankDeck(): Promise<FormState> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .insert({
      title: UNTITLED_DECK,
      description: "",
      classroom_id: null,
      is_shared: false,
    })
    .select("id")
    .single();
  if (error) return failed("create blank", error.message);
  redirect(`/flashcards/${data.id}`);
}

export async function updateDeck(
  deckId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const { values, parsed } = readDeck(form);
  if (!id.safeParse(deckId).success)
    return { error: "That deck doesn't exist.", values };
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  // Sharing has its own action (setShared), so saving the title never changes it.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .update({ title: parsed.data.title, description: parsed.data.description })
    .eq("id", deckId)
    .select("id");
  if (error) return { ...failed("update", error.message), values };
  if (!data?.length) return { error: "You can't edit this deck.", values };
  refresh();
  return { ok: "Saved.", values };
}

// Share or unshare a classroom deck with the people who can view that classroom.
export async function setShared(
  deckId: string,
  shared: boolean,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(deckId).success)
    return { error: "That deck doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .update({ is_shared: shared })
    .eq("id", deckId)
    .select("id");
  if (error) {
    if (error.code === "23514")
      return { error: "Pick a classroom to share this deck to first." };
    if (error.code === "42501")
      return { error: "You can't share this deck to that classroom." };
    return failed("share", error.message);
  }
  if (!data?.length) return { error: "You can't change sharing on this deck." };
  refresh();
  return {
    ok: shared ? "Shared with the classroom." : "Only you can see it now.",
  };
}

export async function deleteDeck(deckId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(deckId).success)
    return { error: "That deck doesn't exist." };
  const supabase = await createClient();
  const { data: deck } = await supabase
    .from("decks")
    .select("classroom_id")
    .eq("id", deckId)
    .maybeSingle();
  const { data, error } = await supabase
    .from("decks")
    .delete()
    .eq("id", deckId)
    .select("id");
  if (error) return failed("delete", error.message);
  if (!data?.length) return { error: "You can't delete this deck." };
  redirect(
    deck?.classroom_id ? `/c/${deck.classroom_id}/flashcards` : "/flashcards",
  );
}

const cardItem = z.object({
  term: z
    .string()
    .trim()
    .min(1, "Write the term.")
    .max(TERM_MAX, `Keep the term under ${TERM_MAX} characters.`),
  definition: z
    .string()
    .trim()
    .min(1, "Write the definition.")
    .max(
      DEFINITION_MAX,
      `Keep the definition under ${DEFINITION_MAX} characters.`,
    ),
});

// Adds cards from the paste preview or the single-card form. Items are already parsed on the client.
export async function addCards(
  deckId: string,
  items: unknown,
): Promise<FormState & { added?: number }> {
  await requireProfile();
  if (!id.safeParse(deckId).success)
    return { error: "That deck doesn't exist." };
  const parsed = z
    .array(cardItem)
    .min(1, "Nothing to add.")
    .max(
      MAX_CARDS_PER_PASTE,
      `Add at most ${MAX_CARDS_PER_PASTE} cards at a time.`,
    )
    .safeParse(items);
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "Fix the cards marked first.",
    };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_cards", {
    did: deckId,
    items: parsed.data,
  });
  if (error) {
    if (error.code === "22023") return { error: `${error.message}.` };
    if (error.code === "42501")
      return {
        error: "Only the owner or the classroom trainer can add cards here.",
      };
    return failed("add cards", error.message);
  }
  refresh();
  const n = Number(data);
  return { ok: `Added ${n} card${n === 1 ? "" : "s"}.`, added: n };
}

const selectionCard = z.object({
  deckId: z.string(),
  newDeckTitle: z
    .string()
    .trim()
    .max(120, "Keep the deck name under 120 characters."),
  term: z
    .string()
    .trim()
    .min(1, "Write the term.")
    .max(500, "Keep the term under 500 characters."),
  definition: z
    .string()
    .trim()
    .min(1, "Write the definition.")
    .max(2000, "Keep the definition under 2000 characters."),
});

// Adds one card picked from a question's text. Deck is an existing one of yours, or "new" to make a personal deck first.
export async function saveSelectionCard(
  input: unknown,
): Promise<FormState & { deckId?: string }> {
  await requireProfile();
  const parsed = selectionCard.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { deckId, newDeckTitle, term, definition } = parsed.data;
  const isNew = deckId === "new";
  if (!isNew && !id.safeParse(deckId).success)
    return { error: "That deck doesn't exist." };
  if (isNew && !newDeckTitle)
    return { fieldErrors: { newDeckTitle: "Name the new deck." } };

  const supabase = await createClient();
  let target = deckId;
  if (isNew) {
    const { data, error } = await supabase
      .from("decks")
      .insert({
        title: newDeckTitle,
        description: "",
        classroom_id: null,
        is_shared: false,
      })
      .select("id")
      .single();
    if (error) return failed("selection deck", error.message);
    target = data.id as string;
  }
  const { error } = await supabase.rpc("add_cards", {
    did: target,
    items: [{ term, definition }],
  });
  if (error) {
    // A deck made just for this card shouldn't survive a failed save, or a retry makes a second empty one.
    if (isNew) await supabase.from("decks").delete().eq("id", target);
    if (error.code === "22023") return { error: `${error.message}.` };
    if (error.code === "42501")
      return { error: "You can't add cards to that deck." };
    return failed("selection card", error.message);
  }
  refresh();
  return { ok: "Saved to flashcards.", deckId: target };
}

export async function updateCard(
  cardId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(cardId).success)
    return { error: "That card doesn't exist." };
  const parsed = cardItem.safeParse({
    term: String(form.get("term") ?? ""),
    definition: String(form.get("definition") ?? ""),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the card." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .update({ term: parsed.data.term, definition: parsed.data.definition })
    .eq("id", cardId)
    .select("id");
  if (error) return failed("update card", error.message);
  if (!data?.length) return { error: "You can't edit this card." };
  refresh();
  return { ok: "Saved." };
}

export async function deleteCard(cardId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(cardId).success)
    return { error: "That card doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .delete()
    .eq("id", cardId)
    .select("id");
  if (error) return failed("delete card", error.message);
  if (!data?.length) return { error: "You can't delete this card." };
  refresh();
  return {};
}

// One row per tap in study mode. Reviews are private to the reviewer.
export async function recordReview(
  cardId: string,
  known: boolean,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(cardId).success)
    return { error: "That card doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("card_reviews")
    .insert({ card_id: cardId, known });
  if (error) return failed("review", error.message);
  return {};
}
