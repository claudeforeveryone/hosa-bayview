"use server";

import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FavoriteState = { ok?: boolean; favorite?: boolean; error?: string };

const input = z.object({ questionId: z.string().uuid(), favorite: z.boolean() });

// Star or unstar a question for yourself. The database only allows your own rows, on questions you can view.
// No refresh: the star updates in place, and the career page reads fresh stars on its next load.
export async function setFavorite(questionId: string, favorite: boolean): Promise<FavoriteState> {
  const parsed = input.safeParse({ questionId, favorite });
  if (!parsed.success) return { error: "Pick a question." };
  const profile = await requireProfile();
  const supabase = await createClient();
  if (parsed.data.favorite) {
    const { error } = await supabase
      .from("question_favorites")
      .insert({ question_id: parsed.data.questionId });
    // Already starred (a second tab, a double tap) is the state we wanted.
    if (error && error.code !== "23505") {
      if (error.code === "42501") return { error: "You can't star that question." };
      console.error("[career] favourite:", error.message);
      return { error: "Couldn't save that. Try again." };
    }
    return { ok: true, favorite: true };
  }
  const { error } = await supabase
    .from("question_favorites")
    .delete()
    .eq("user_id", profile.id)
    .eq("question_id", parsed.data.questionId);
  if (error) {
    console.error("[career] unfavourite:", error.message);
    return { error: "Couldn't save that. Try again." };
  }
  return { ok: true, favorite: false };
}

// Which of these questions you've starred. Used where the page can't pass stars in (a reviewed attempt).
export async function favoriteIds(questionIds: string[]): Promise<string[]> {
  const parsed = z.array(z.string().uuid()).max(500).safeParse(questionIds);
  if (!parsed.success || parsed.data.length === 0) return [];
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_favorites")
    .select("question_id")
    .in("question_id", parsed.data);
  if (error) {
    // Before 0100 is applied the table is missing; stars just start empty.
    if (error.code !== "42P01" && error.code !== "PGRST205") console.error("[career] favourites:", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.question_id as string);
}
