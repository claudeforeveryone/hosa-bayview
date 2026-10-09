"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { canTeach, requireProfile } from "@/lib/auth";
import { UNTITLED_TEST } from "@/lib/untitled";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

function failed(where: string, message: string): FormState {
  console.error(`[tests:${where}]`, message);
  return { error: "That didn't save. Try again." };
}

// Postgres raises plain-language 22023 messages from check_question; pass those through.
function rpcError(where: string, error: { code?: string; message: string }): FormState {
  if (error.code === "22023") return { error: `${error.message}.` };
  if (error.code === "42501") return { error: "Only the trainer or an executive can edit this test." };
  return failed(where, error.message);
}

const testFields = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120, "Keep the title under 120 characters."),
  description: z.string().trim().max(1000, "Keep the description under 1000 characters."),
  time_limit: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 300), "Use 1 to 300 minutes, or leave it blank."),
});

function readTest(form: FormData) {
  const values = {
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? "").replace(/\r\n?/g, "\n"),
    time_limit: String(form.get("time_limit") ?? ""),
  };
  const parsed = testFields.safeParse(values);
  return {
    values,
    parsed,
    row: parsed.success
      ? {
          title: parsed.data.title,
          description: parsed.data.description,
          time_limit_minutes: parsed.data.time_limit ? Number(parsed.data.time_limit) : null,
        }
      : null,
  };
}

// One tap from the classroom or Tests page: a blank draft, straight into its editor.
export async function createBlankTest(_: FormState, form: FormData): Promise<FormState> {
  const profile = await requireProfile();
  if (!canTeach(profile)) return { error: "Only trainers and executives can add tests." };
  const classroomId = String(form.get("classroom_id") ?? "");
  if (!id.safeParse(classroomId).success) return { error: "That classroom doesn't exist." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .insert({
      title: UNTITLED_TEST,
      description: "",
      time_limit_minutes: null,
      is_published: false,
      classroom_id: classroomId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501") return { error: "Only the trainer or an executive can add tests here." };
    return failed("create", error.message);
  }
  redirect(`/c/${classroomId}/tests/${data.id}/edit`);
}

export async function updateTest(testId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireProfile();
  const { values, parsed, row } = readTest(form);
  if (!id.safeParse(testId).success) return { error: "That test doesn't exist.", values };
  if (!parsed.success || !row) return { fieldErrors: fieldErrors(parsed.error!), values };

  const supabase = await createClient();
  const { data, error } = await supabase.from("tests").update(row).eq("id", testId).select("id");
  if (error) return { ...failed("update", error.message), values };
  if (!data?.length) return { error: "You can't edit this test.", values };
  refresh();
  return { ok: "Saved.", values };
}

export async function setPublished(testId: string, published: boolean): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(testId).success) return { error: "That test doesn't exist." };
  const supabase = await createClient();
  if (published) {
    const { count, error } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("test_id", testId);
    if (error) return failed("publish", error.message);
    if (!count) return { error: "Add at least one question first." };
  }
  const { data, error } = await supabase.from("tests").update({ is_published: published }).eq("id", testId).select("id");
  if (error) return failed("publish", error.message);
  if (!data?.length) return { error: "You can't edit this test." };
  refresh();
  return { ok: published ? "Posted. Members can take it now." : "Hidden from members." };
}

export async function deleteTest(classroomId: string, testId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(testId).success || !id.safeParse(classroomId).success) return { error: "That test doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tests").delete().eq("id", testId).select("id");
  if (error) return failed("delete", error.message);
  if (!data?.length) return { error: "You can't delete this test." };
  redirect(`/c/${classroomId}/tests`);
}

const choice = z.string().trim().max(500, "Keep choices under 500 characters.");
const questionFields = z.object({
  prompt: z.string().trim().min(1, "Write the question.").max(2000, "Keep the question under 2000 characters."),
  right: choice.min(1, "Write the right answer."),
  others: z
    .array(choice)
    .transform((o) => o.filter(Boolean))
    .pipe(z.array(z.string()).min(1, "Add at least one wrong choice.").max(4, "4 wrong choices at most.")),
  explanation: z.string().trim().max(2000, "Keep the explanation under 2000 characters."),
});

// The builder asks for the right answer and the wrong choices separately; it's stored first
// and choices are shuffled per attempt when the test is taken.
export async function saveQuestion(
  testId: string,
  questionId: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const clean = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\r\n?/g, "\n");
  const others = form.getAll("other").map(clean);
  const values = {
    prompt: clean(form.get("prompt")),
    right: clean(form.get("right")),
    explanation: clean(form.get("explanation")),
    others: JSON.stringify(others),
  };
  if (!id.safeParse(testId).success || (questionId !== null && !id.safeParse(questionId).success)) {
    return { error: "That question doesn't exist.", values };
  }
  const parsed = questionFields.safeParse({ ...values, others });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const options = [parsed.data.right, ...parsed.data.others];
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return { fieldErrors: { others: "Two choices are the same." }, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_question", {
    tid: testId,
    qid: questionId,
    prompt: parsed.data.prompt,
    options,
    correct: 0,
    explanation: parsed.data.explanation,
  });
  if (error) return { ...rpcError("save question", error), values };
  refresh();
  return { ok: questionId ? "Saved." : "Added." };
}

export async function deleteQuestion(questionId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(questionId).success) return { error: "That question doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_question", { qid: questionId });
  if (error) return rpcError("delete question", error);
  refresh();
  return {};
}

const importItem = z.object({
  prompt: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(5),
  correct: z.number().int().min(0).max(4),
  explanation: z.string().trim().max(2000),
});

export async function importQuestions(testId: string, items: unknown): Promise<FormState & { added?: number }> {
  await requireProfile();
  if (!id.safeParse(testId).success) return { error: "That test doesn't exist." };
  const parsed = z.array(importItem).min(1, "Nothing to add.").max(300, "Add at most 300 questions at a time.").safeParse(items);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Fix the questions marked in red first." };
  if (parsed.data.some((q) => q.correct >= q.options.length)) return { error: "Every question needs a right answer." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_questions", { tid: testId, items: parsed.data });
  if (error) return rpcError("import", error);
  refresh();
  return { ok: `Added ${data} question${data === 1 ? "" : "s"}.`, added: Number(data) };
}

export async function startAttempt(classroomId: string, testId: string, mode: "timed" | "practice"): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(testId).success || !id.safeParse(classroomId).success) return { error: "That test doesn't exist." };
  if (mode !== "timed" && mode !== "practice") return { error: "Pick timed or practice." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_attempt", { tid: testId, mode });
  if (error) {
    if (error.code === "22023") return { error: `${error.message}.` };
    if (error.code === "42501") return { error: "You can't take this test." };
    return failed("start", error.message);
  }
  redirect(`/c/${classroomId}/tests/${testId}/a/${data}`);
}

export type AnswerResult = {
  error?: string;
  selected_index?: number | null;
  is_correct?: boolean | null;
  correct_index?: number | null;
  explanation?: string | null;
};

export async function answerQuestion(attemptId: string, questionId: string, selected: number): Promise<AnswerResult> {
  await requireProfile();
  if (!id.safeParse(attemptId).success || !id.safeParse(questionId).success || !Number.isInteger(selected)) {
    return { error: "That answer didn't save." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("answer_question", { aid: attemptId, qid: questionId, selected })
    .single<{ selected_index: number | null; is_correct: boolean | null; correct_index: number | null; explanation: string | null }>();
  if (error) {
    if (error.code === "22023") return { error: `${error.message}.` };
    console.error("[tests:answer]", error.message);
    return { error: "That answer didn't save. Check your connection and tap it again." };
  }
  return data;
}

export async function submitAttempt(attemptId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(attemptId).success) return { error: "That attempt doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_attempt", { aid: attemptId });
  if (error) return failed("submit", error.message);
  refresh();
  return { ok: "Submitted." };
}
