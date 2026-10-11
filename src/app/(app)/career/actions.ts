"use server";

import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FavoriteState = {
  ok?: boolean;
  favorite?: boolean;
  error?: string;
};

const input = z.object({
  questionId: z.string().uuid(),
  favorite: z.boolean(),
});

// Star or unstar a question for yourself. The database only allows your own rows, on questions you can view.
// No refresh: the star updates in place, and the career page reads fresh stars on its next load.
export async function setFavorite(
  questionId: string,
  favorite: boolean,
): Promise<FavoriteState> {
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
      if (error.code === "42501")
        return { error: "You can't star that question." };
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
    if (error.code !== "42P01" && error.code !== "PGRST205")
      console.error("[career] favourites:", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.question_id as string);
}

export type CareerAnswer = {
  error?: string;
  test_id?: string;
  selected_index?: number | null;
  is_correct?: boolean | null;
  correct_index?: number | null;
  explanation?: string | null;
};

const answerInput = z.object({
  questionId: z.string().uuid(),
  selected: z.number().int().min(0).max(4),
});

// One answer in a career quiz. It runs as a practice answer on the question's own test (the same rules as
// practice: the key comes back only once you've answered, and the answer counts toward your stats). The
// database checks everything, so this never reads a key first.
export async function answerCareerQuestion(
  questionId: string,
  selected: number,
): Promise<CareerAnswer> {
  const parsed = answerInput.safeParse({ questionId, selected });
  if (!parsed.success) return { error: "That answer didn't save." };
  await requireProfile();
  const supabase = await createClient();
  const { data: question, error: qError } = await supabase
    .from("questions")
    .select("test_id")
    .eq("id", parsed.data.questionId)
    .maybeSingle();
  if (qError || !question)
    return { error: "That question isn't available to practise." };
  const testId = question.test_id as string;
  const { data: attemptId, error: startError } = await supabase.rpc(
    "start_attempt",
    {
      tid: testId,
      mode: "practice",
    },
  );
  if (startError) return { error: careerError(startError) };
  const { data, error } = await supabase
    .rpc("answer_question", {
      aid: attemptId as string,
      qid: parsed.data.questionId,
      selected: parsed.data.selected,
    })
    .single<Omit<CareerAnswer, "test_id">>();
  if (error) return { error: careerError(error) };
  return { ...data, test_id: testId };
}

// Closes the practice runs a quiz used, so the next quiz starts fresh and every answer is final. Only your
// own open practice runs on those tests are touched.
export async function finishCareerQuiz(
  testIds: string[],
): Promise<{ ok?: boolean; error?: string }> {
  const parsed = z.array(z.string().uuid()).max(200).safeParse(testIds);
  if (!parsed.success) return { error: "Couldn't finish the quiz." };
  if (parsed.data.length === 0) return { ok: true };
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attempts")
    .select("id")
    .eq("user_id", profile.id)
    .eq("mode", "practice")
    .is("submitted_at", null)
    .in("test_id", parsed.data);
  if (error) return { error: "Couldn't finish the quiz." };
  for (const row of data ?? []) {
    const { error: submitError } = await supabase.rpc("submit_attempt", {
      aid: row.id as string,
    });
    if (submitError)
      console.error("[career] finish quiz:", submitError.message);
  }
  return { ok: true };
}

// The database's own messages (practice off, locked, live battle) are written for members; anything else is generic.
function careerError(error: { code?: string; message: string }): string {
  if (error.code === "22023") return `${error.message}.`;
  if (error.code === "42501") return "You can't practise that question.";
  console.error("[career] quiz:", error.message);
  return "That answer didn't save. Check your connection and try again.";
}
