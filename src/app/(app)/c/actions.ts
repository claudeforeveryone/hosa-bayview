"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile, canTeach } from "@/lib/auth";
import { JOIN_CODE, normalizeCode } from "@/lib/join-code";
import { removeClassroomFiles } from "@/lib/material-cleanup";
import { createClient } from "@/lib/supabase/server";

export type FormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const id = z.string().uuid();

const classroomFields = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(80, "Keep the name under 80 characters."),
  event: z.string().trim().max(80, "Keep the event under 80 characters."),
  description: z.string().trim().max(1000, "Keep the description under 1000 characters."),
});

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

// Optional: a room with no category picked yet (older rooms) sends none, and the column is left as it is.
const category = z.enum(["mc", "practical", "showcase"], { error: "Pick MC, Practical or Showcase." });

function readClassroom(form: FormData) {
  const values = {
    name: String(form.get("name") ?? ""),
    event: String(form.get("event") ?? ""),
    // Browsers send textarea newlines as CRLF but count them as one character for maxLength.
    description: String(form.get("description") ?? "").replace(/\r\n?/g, "\n"),
    category: String(form.get("category") ?? ""),
  };
  const schema = values.category ? classroomFields.extend({ category }) : classroomFields;
  return { values, parsed: schema.safeParse(values) };
}

function failed(where: string, message: string): FormState {
  console.error(`[classrooms:${where}]`, message);
  return { error: "That didn't save. Try again." };
}

export async function joinClassroom(_: FormState, form: FormData): Promise<FormState> {
  await requireProfile();
  const code = normalizeCode(form.get("code"));
  const values = { code: String(form.get("code") ?? "") };
  if (code.length !== 6) return { fieldErrors: { code: "Codes are 6 characters, like K7P Q2M." }, values };
  if (!JOIN_CODE.test(code)) return { fieldErrors: { code: "Codes never use 0, O, 1, I or L. Check those characters." }, values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_classroom", { code });
  if (error) {
    if (error.code === "54000") return { error: "Too many wrong codes. Wait 10 minutes and try again.", values };
    return { ...failed("join", error.message), values };
  }
  if (!data) return { fieldErrors: { code: "No classroom has that code. Double-check it with your trainer." }, values };
  redirect(`/c/${data}`);
}

export async function createClassroom(_: FormState, form: FormData): Promise<FormState> {
  const profile = await requireProfile();
  if (!canTeach(profile)) return { error: "Only trainers and executives can make classrooms." };
  const { values, parsed } = readClassroom(form);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.from("classrooms").insert(parsed.data).select("id").single();
  if (error) return { ...failed("create", error.message), values };
  redirect(`/c/${data.id}`);
}

export async function updateClassroom(classroomId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireProfile();
  const { values, parsed } = readClassroom(form);
  if (!id.safeParse(classroomId).success) return { error: "That classroom doesn't exist.", values };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.from("classrooms").update(parsed.data).eq("id", classroomId).select("id");
  if (error) return { ...failed("update", error.message), values };
  if (!data?.length) return { error: "You can't edit this classroom.", values };
  refresh();
  return { ok: "Saved.", values };
}

export async function deleteClassroom(classroomId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success) return { error: "That classroom doesn't exist." };
  const supabase = await createClient();
  await removeClassroomFiles(supabase, classroomId);
  const { data, error } = await supabase.from("classrooms").delete().eq("id", classroomId).select("id");
  if (error) return failed("delete", error.message);
  if (!data?.length) return { error: "You can't delete this classroom." };
  redirect("/");
}

export async function regenerateCode(classroomId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success) return { error: "That classroom doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_join_code", { cid: classroomId });
  if (error) {
    if (error.code === "42501") return { error: "Only the trainer or an executive can change the code." };
    return failed("regenerate", error.message);
  }
  refresh();
  return { ok: "New code is live." };
}

export async function removeMember(classroomId: string, userId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success || !id.safeParse(userId).success) return { error: "That member isn't here." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classroom_members")
    .delete()
    .eq("classroom_id", classroomId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return failed("remove", error.message);
  if (!data?.length) return { error: "You can't remove this member." };
  refresh();
  return {};
}

export async function leaveClassroom(classroomId: string): Promise<FormState> {
  const profile = await requireProfile();
  if (!id.safeParse(classroomId).success) return { error: "That classroom doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classroom_members")
    .delete()
    .eq("classroom_id", classroomId)
    .eq("user_id", profile.id)
    .select("user_id");
  if (error) return failed("leave", error.message);
  if (!data?.length) return { error: "You're not a member of this classroom." };
  redirect("/");
}
