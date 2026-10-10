"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireProfile } from "@/lib/auth";
import { parseSteps, stepsSchema } from "@/lib/parse/steps";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

const NOT_MANAGER = "Only the trainer or an executive can change skills.";

const fields = z.object({
  name: z
    .string()
    .min(1, "Give the skill a name.")
    .max(120, "Keep the name under 120 characters."),
  round: z.string().max(80, "Keep the round under 80 characters."),
  note: z.string().max(500, "Keep the note under 500 characters."),
});

function failed(where: string, message: string): FormState {
  console.error(`[skills:${where}]`, message);
  return { error: "That didn't save. Try again." };
}

// The steps column is plain jsonb, so this is where step shape is enforced.
function readSkill(form: FormData) {
  const text = (key: string) =>
    String(form.get(key) ?? "").replace(/\r\n?/g, "\n");
  const values = {
    name: text("name"),
    round: text("round"),
    steps: text("steps"),
    note: text("note"),
  };
  const fieldErrors: Record<string, string> = {};

  const parsed = fields.safeParse({
    name: values.name.trim(),
    round: values.round.trim(),
    note: values.note.trim(),
  });
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0])] ??= issue.message;

  const steps = stepsSchema.safeParse(parseSteps(values.steps));
  if (!steps.success) {
    const issue = steps.error.issues[0];
    const at =
      typeof issue.path[0] === "number" ? `Step ${issue.path[0] + 1}: ` : "";
    fieldErrors.steps = `${at}${issue.message}`;
  }

  if (!parsed.success || !steps.success)
    return { values, fieldErrors, row: null };
  const { name, round, note } = parsed.data;
  return {
    values,
    fieldErrors,
    row: { name, round: round || null, steps: steps.data, note: note || null },
  };
}

export async function saveSkill(
  classroomId: string,
  skillId: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const { values, fieldErrors, row } = readSkill(form);
  if (
    !id.safeParse(classroomId).success ||
    (skillId !== null && !id.safeParse(skillId).success)
  ) {
    return { error: "That skill doesn't exist.", values };
  }
  if (!row) return { fieldErrors, values };

  const supabase = await createClient();
  if (skillId === null) {
    // New skills go to the end of the list.
    const { data: last, error: lastError } = await supabase
      .from("skills")
      .select("position")
      .eq("classroom_id", classroomId)
      .order("position", { ascending: false })
      .limit(1);
    if (lastError) return { ...failed("position", lastError.message), values };
    const position = last?.length
      ? (last[0] as { position: number }).position + 1
      : 0;
    const { error } = await supabase
      .from("skills")
      .insert({ classroom_id: classroomId, position, ...row });
    if (error) {
      if (error.code === "42501") return { error: NOT_MANAGER, values };
      return { ...failed("add", error.message), values };
    }
    refresh();
    return { ok: "Added.", values: {} };
  }

  const { data, error } = await supabase
    .from("skills")
    .update(row)
    .eq("id", skillId)
    .eq("classroom_id", classroomId)
    .select("id");
  if (error) {
    if (error.code === "42501") return { error: NOT_MANAGER, values };
    return { ...failed("edit", error.message), values };
  }
  if (!data?.length) return { error: NOT_MANAGER, values };
  refresh();
  return { ok: "Saved.", values };
}

export async function deleteSkill(
  classroomId: string,
  skillId: string,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success || !id.safeParse(skillId).success)
    return { error: "That skill doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("skills")
    .delete()
    .eq("id", skillId)
    .eq("classroom_id", classroomId)
    .select("id");
  if (error) {
    if (error.code === "42501") return { error: NOT_MANAGER };
    return failed("delete", error.message);
  }
  if (!data?.length) return { error: NOT_MANAGER };
  refresh();
  return { ok: "Deleted." };
}
