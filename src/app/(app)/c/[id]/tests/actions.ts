"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { canTeach, requireProfile } from "@/lib/auth";
import { UNTITLED_TEST } from "@/lib/untitled";
import { createClient } from "@/lib/supabase/server";
import { checkReport } from "@/lib/flag-reasons";
import { IMPORT_MAX, checkQuestion } from "@/lib/question-rules";
import { parseAttemptsAllowed, practiceRuleOk } from "@/lib/test-settings";

const id = z.string().uuid();

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues)
    out[String(issue.path[0])] ??= issue.message;
  return out;
}

function failed(where: string, message: string): FormState {
  console.error(`[tests:${where}]`, message);
  return { error: "That didn't save. Try again." };
}

// Postgres raises plain-language 22023 messages from check_question; pass those through.
function rpcError(
  where: string,
  error: { code?: string; message: string },
): FormState {
  if (error.code === "22023") return { error: `${error.message}.` };
  if (error.code === "42501")
    return { error: "Only the trainer or an executive can edit this test." };
  return failed(where, error.message);
}

const testFields = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give it a title.")
      .max(120, "Keep the title under 120 characters."),
    description: z
      .string()
      .trim()
      .max(1000, "Keep the description under 1000 characters."),
    time_limit: z
      .string()
      .trim()
      .refine(
        (v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 300),
        "Use 1 to 300 minutes, or leave it blank.",
      ),
    attempts_allowed: z.string().trim(),
    shuffle_questions: z.string(),
    shuffle_choices: z.string(),
    allow_practice: z.string(),
    show_answers: z.string(),
  })
  .superRefine((v, ctx) => {
    const attempts = parseAttemptsAllowed(v.attempts_allowed);
    if (!attempts.ok)
      ctx.addIssue({
        code: "custom",
        path: ["attempts_allowed"],
        message: attempts.error,
      });
    if (
      !practiceRuleOk(
        v.time_limit ? Number(v.time_limit) : null,
        v.allow_practice === "on",
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["allow_practice"],
        message: "Keep practice on, or set a time limit.",
      });
    }
  });

function readTest(form: FormData) {
  const values = {
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? "").replace(/\r\n?/g, "\n"),
    time_limit: String(form.get("time_limit") ?? ""),
    attempts_allowed: String(form.get("attempts_allowed") ?? ""),
    shuffle_questions: form.get("shuffle_questions") === "on" ? "on" : "",
    shuffle_choices: form.get("shuffle_choices") === "on" ? "on" : "",
    allow_practice: form.get("allow_practice") === "on" ? "on" : "",
    show_answers: form.get("show_answers") === "on" ? "on" : "",
  };
  const parsed = testFields.safeParse(values);
  const attempts = parseAttemptsAllowed(values.attempts_allowed);
  return {
    values,
    parsed,
    row:
      parsed.success && attempts.ok
        ? {
            title: parsed.data.title,
            description: parsed.data.description,
            time_limit_minutes: parsed.data.time_limit
              ? Number(parsed.data.time_limit)
              : null,
            shuffle_questions: parsed.data.shuffle_questions === "on",
            shuffle_choices: parsed.data.shuffle_choices === "on",
            allow_practice: parsed.data.allow_practice === "on",
            show_answers: parsed.data.show_answers === "on",
            attempts_allowed: attempts.value,
          }
        : null,
  };
}

// One tap from the classroom or Tests page: a blank draft, straight into its editor.
export async function createBlankTest(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (!canTeach(profile))
    return { error: "Only trainers and executives can add tests." };
  const classroomId = String(form.get("classroom_id") ?? "");
  if (!id.safeParse(classroomId).success)
    return { error: "That event doesn't exist." };

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
    if (error.code === "42501")
      return { error: "Only the trainer or an executive can add tests here." };
    return failed("create", error.message);
  }
  redirect(`/c/${classroomId}/tests/${data.id}/edit`);
}

export async function updateTest(
  testId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const { values, parsed, row } = readTest(form);
  if (!id.safeParse(testId).success)
    return { error: "That test doesn't exist.", values };
  if (!parsed.success || !row)
    return { fieldErrors: fieldErrors(parsed.error!), values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .update(row)
    .eq("id", testId)
    .select("id");
  if (error) return { ...failed("update", error.message), values };
  if (!data?.length) return { error: "You can't edit this test.", values };
  refresh();
  return { ok: "Saved.", values };
}

export async function setPublished(
  testId: string,
  published: boolean,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(testId).success)
    return { error: "That test doesn't exist." };
  const supabase = await createClient();
  if (published) {
    const { count, error } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("test_id", testId);
    if (error) return failed("publish", error.message);
    if (!count) return { error: "Add at least one question first." };
  }
  const { data, error } = await supabase
    .from("tests")
    .update({ is_published: published })
    .eq("id", testId)
    .select("id");
  if (error) return failed("publish", error.message);
  if (!data?.length) return { error: "You can't edit this test." };
  refresh();
  return {
    ok: published ? "Posted. Members can take it now." : "Hidden from members.",
  };
}

export async function deleteTest(
  classroomId: string,
  testId: string,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(testId).success || !id.safeParse(classroomId).success)
    return { error: "That test doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .delete()
    .eq("id", testId)
    .select("id");
  if (error) return failed("delete", error.message);
  if (!data?.length) return { error: "You can't delete this test." };
  redirect(`/c/${classroomId}/tests`);
}

// The editor sends the choices in the order typed, and which one is right (its position).
// Saved exactly as given, so the right answer is never always option A.
export async function saveQuestion(
  testId: string,
  questionId: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const clean = (v: FormDataEntryValue | null) =>
    String(v ?? "").replace(/\r\n?/g, "\n");
  const choices = form.getAll("choice").map(clean);
  const correctRaw = clean(form.get("correct"));
  const values = {
    prompt: clean(form.get("prompt")),
    explanation: clean(form.get("explanation")),
    choices: JSON.stringify(choices),
    correct: correctRaw,
  };
  if (
    !id.safeParse(testId).success ||
    (questionId !== null && !id.safeParse(questionId).success)
  ) {
    return { error: "That question doesn't exist.", values };
  }
  const trimmed = choices.map((c) => c.trim());
  const correct = /^\d+$/.test(correctRaw) ? Number(correctRaw) : -1;
  const fields = checkQuestion({
    prompt: values.prompt,
    choices,
    correct,
    explanation: values.explanation,
  });
  if (Object.keys(fields).length) return { fieldErrors: fields, values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_question", {
    tid: testId,
    qid: questionId,
    prompt: values.prompt.trim(),
    options: trimmed,
    correct,
    explanation: values.explanation.trim(),
  });
  if (error) return { ...rpcError("save question", error), values };
  refresh();
  return { ok: questionId ? "Saved." : "Added." };
}

export async function deleteQuestion(questionId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(questionId).success)
    return { error: "That question doesn't exist." };
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

// The old per-question import takes 300 at a time.
const LEGACY_IMPORT_MAX = 300;

// One round trip: import_questions_bulk (0085) inserts the whole batch in one statement, all or nothing.
// Until that migration is applied the function is missing (PGRST202 from the API, 42883 from Postgres), so this
// falls back to import_questions in chunks of 300.
export async function importQuestions(
  testId: string,
  items: unknown,
): Promise<FormState & { added?: number }> {
  await requireProfile();
  if (!id.safeParse(testId).success)
    return { error: "That test doesn't exist." };
  const parsed = z
    .array(importItem)
    .min(1, "Nothing to add.")
    .max(IMPORT_MAX, `Add at most ${IMPORT_MAX} questions at a time.`)
    .safeParse(items);
  if (!parsed.success)
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Fix the questions marked in red first.",
    };
  if (parsed.data.some((q) => q.correct >= q.options.length))
    return { error: "Every question needs a right answer." };
  // Same rule as adding one question.
  const dup = parsed.data.findIndex(
    (q) =>
      new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length,
  );
  if (dup !== -1)
    return { error: `Question ${dup + 1} has two choices the same.` };

  const supabase = await createClient();
  const bulk = await supabase.rpc("import_questions_bulk", {
    tid: testId,
    items: parsed.data,
  });
  let added = 0;
  if (!bulk.error) {
    added = Number(bulk.data);
  } else if (bulk.error.code === "PGRST202" || bulk.error.code === "42883") {
    for (let at = 0; at < parsed.data.length; at += LEGACY_IMPORT_MAX) {
      const { data, error } = await supabase.rpc("import_questions", {
        tid: testId,
        items: parsed.data.slice(at, at + LEGACY_IMPORT_MAX),
      });
      if (error) {
        if (!added) return rpcError("import", error);
        refresh();
        const why = error.code === "22023" ? `${error.message}.` : "Try again.";
        if (error.code !== "22023")
          console.error("[tests:import]", error.message);
        return {
          error: `Added ${added} of ${parsed.data.length}. The rest didn't save: ${why}`,
          added,
        };
      }
      added += Number(data);
    }
  } else {
    return rpcError("import", bulk.error);
  }
  refresh();
  return {
    ok: `Added ${added} question${added === 1 ? "" : "s"}.`,
    added,
  };
}

export async function startAttempt(
  classroomId: string,
  testId: string,
  mode: "timed" | "practice",
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(testId).success || !id.safeParse(classroomId).success)
    return { error: "That test doesn't exist." };
  if (mode !== "timed" && mode !== "practice")
    return { error: "Pick timed or practice." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_attempt", {
    tid: testId,
    mode,
  });
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

export async function answerQuestion(
  attemptId: string,
  questionId: string,
  selected: number,
): Promise<AnswerResult> {
  await requireProfile();
  if (
    !id.safeParse(attemptId).success ||
    !id.safeParse(questionId).success ||
    !Number.isInteger(selected)
  ) {
    return { error: "That answer didn't save." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("answer_question", { aid: attemptId, qid: questionId, selected })
    .single<{
      selected_index: number | null;
      is_correct: boolean | null;
      correct_index: number | null;
      explanation: string | null;
    }>();
  if (error) {
    if (error.code === "22023") return { error: `${error.message}.` };
    console.error("[tests:answer]", error.message);
    return {
      error: "That answer didn't save. Check your connection and tap it again.",
    };
  }
  return data;
}

export async function submitAttempt(attemptId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(attemptId).success)
    return { error: "That attempt doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_attempt", { aid: attemptId });
  if (error) return failed("submit", error.message);
  refresh();
  return { ok: "Submitted." };
}

export type FlagResult = { error?: string; id?: string };

// Ask teacher from practice feedback or a finished review. The database checks the taker has answered the question.
export async function askTeacher(
  testId: string,
  questionId: string,
  note: string,
): Promise<FlagResult> {
  await requireProfile();
  if (!id.safeParse(testId).success || !id.safeParse(questionId).success)
    return { error: "That question doesn't exist." };
  const clean = note.replace(/\r\n?/g, "\n").trim();
  if (clean.length > 500)
    return { error: "Keep the note under 500 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("flag_question", {
    qid: questionId,
    note: clean,
  });
  if (error) {
    if (error.code === "22023" || error.code === "53400")
      return { error: `${error.message}.` };
    if (error.code === "42501")
      return { error: "You can't ask about this test." };
    return failed("ask teacher", error.message);
  }
  return { id: String(data) };
}

// Report this question (0231): the same thread as Ask teacher, with what is wrong (wrong key, unclear, typo or
// something else). The room's trainer gets it like a question; the owner console counts the open ones.
export async function reportQuestion(
  testId: string,
  questionId: string,
  reason: string,
  note: string,
): Promise<FlagResult> {
  await requireProfile();
  if (!id.safeParse(testId).success || !id.safeParse(questionId).success)
    return { error: "That question doesn't exist." };
  const clean = note.replace(/\r\n?/g, "\n").trim();
  const problem = checkReport(reason, clean);
  if (problem) return { error: problem };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_question", {
    qid: questionId,
    reason,
    note: clean,
  });
  if (error) {
    if (error.code === "22023" || error.code === "53400")
      return { error: `${error.message}.` };
    if (error.code === "42501")
      return { error: "You can't report questions on this test." };
    if (error.code === "PGRST202" || error.code === "42883")
      return { error: "Reports aren't switched on yet. Use Ask teacher for now." };
    return failed("report question", error.message);
  }
  return { id: String(data) };
}

// Trainers and executives mark a question answered, with an optional reply the member sees.
export async function replyToFlag(
  testId: string,
  flagId: string,
  reply: string,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(testId).success || !id.safeParse(flagId).success)
    return { error: "That question doesn't exist." };
  const clean = reply.replace(/\r\n?/g, "\n").trim();
  if (clean.length > 1000)
    return { error: "Keep the reply under 1000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_flag", {
    fid: flagId,
    reply: clean,
  });
  if (error) {
    if (error.code === "22023") return { error: `${error.message}.` };
    if (error.code === "42501")
      return { error: "Only the trainer or an executive can reply." };
    return failed("reply flag", error.message);
  }
  refresh();
  return { ok: "Marked answered." };
}
