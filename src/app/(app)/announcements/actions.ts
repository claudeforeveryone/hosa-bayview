"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

// RLS decides who posts: executives for the chapter, the room's trainer (or an exec) for a classroom.
const notAllowed = (classroomId: string | null) =>
  classroomId
    ? "Only the trainer or an executive can post here."
    : "Only executives can post chapter announcements.";

function failed(where: string, message: string): FormState {
  console.error(`[announcements:${where}]`, message);
  return { error: "That didn't save. Try again." };
}

function read(form: FormData) {
  const values = {
    title: String(form.get("title") ?? "").trim(),
    body: String(form.get("body") ?? "")
      .replace(/\r\n?/g, "\n")
      .trim(),
    pinned: form.get("pinned") === "on" ? "on" : "",
  };
  const fieldErrors: Record<string, string> = {};
  if (!values.title) fieldErrors.title = "Give it a headline.";
  else if (values.title.length > 120)
    fieldErrors.title = "Keep the headline under 120 characters.";
  if (values.body.length > 5000)
    fieldErrors.body = "Keep it under 5000 characters.";
  return { values, fieldErrors };
}

export async function saveAnnouncement(
  classroomId: string | null,
  announcementId: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const { values, fieldErrors } = read(form);
  if (
    (classroomId !== null && !id.safeParse(classroomId).success) ||
    (announcementId !== null && !id.safeParse(announcementId).success)
  )
    return { error: "That announcement doesn't exist.", values };
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const row = {
    title: values.title,
    body: values.body,
    pinned: values.pinned === "on",
  };
  const supabase = await createClient();
  if (announcementId === null) {
    const { error } = await supabase
      .from("announcements")
      .insert({ ...row, classroom_id: classroomId });
    if (error) {
      if (error.code === "42501")
        return { error: notAllowed(classroomId), values };
      return { ...failed("post", error.message), values };
    }
    refresh();
    return { ok: "Posted. Everyone's been notified.", values: {} };
  }

  const { data, error } = await supabase
    .from("announcements")
    .update(row)
    .eq("id", announcementId)
    .select("id");
  if (error) {
    if (error.code === "42501")
      return { error: notAllowed(classroomId), values };
    return { ...failed("edit", error.message), values };
  }
  if (!data?.length) return { error: notAllowed(classroomId), values };
  refresh();
  return { ok: "Saved.", values };
}

export async function setPinned(
  announcementId: string,
  pinned: boolean,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(announcementId).success)
    return { error: "That announcement doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .update({ pinned })
    .eq("id", announcementId)
    .select("id");
  if (error) return failed("pin", error.message);
  if (!data?.length) return { error: "You can't change this one." };
  refresh();
  return { ok: pinned ? "Pinned." : "Unpinned." };
}

export async function deleteAnnouncement(
  announcementId: string,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(announcementId).success)
    return { error: "That announcement doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId)
    .select("id");
  if (error) return failed("delete", error.message);
  if (!data?.length) return { error: "You can't delete this one." };
  refresh();
  return { ok: "Deleted." };
}
