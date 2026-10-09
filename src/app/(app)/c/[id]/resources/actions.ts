"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireProfile } from "@/lib/auth";
import { cleanUrl, parseTopics } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

const NOT_MANAGER = "Only the trainer or an executive can change this.";

function failed(where: string, message: string): FormState {
  console.error(`[resources:${where}]`, message);
  return { error: "That didn't save. Try again." };
}

function readLink(form: FormData) {
  const values = {
    title: String(form.get("title") ?? "").trim(),
    url: String(form.get("url") ?? "").trim(),
    note: String(form.get("note") ?? "").replace(/\r\n?/g, "\n").trim(),
  };
  const fieldErrors: Record<string, string> = {};
  if (!values.title) fieldErrors.title = "Give the link a title.";
  else if (values.title.length > 120) fieldErrors.title = "Keep the title under 120 characters.";
  const url = cleanUrl(values.url);
  if (!url) fieldErrors.url = "Use a web address, like https://example.com.";
  if (values.note.length > 500) fieldErrors.note = "Keep the note under 500 characters.";
  return { values, fieldErrors, row: url && !Object.keys(fieldErrors).length ? { title: values.title, url, note: values.note } : null };
}

export async function saveResource(
  classroomId: string,
  resourceId: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const { values, fieldErrors, row } = readLink(form);
  if (!id.safeParse(classroomId).success || (resourceId !== null && !id.safeParse(resourceId).success)) {
    return { error: "That link doesn't exist.", values };
  }
  if (!row) return { fieldErrors, values };

  const supabase = await createClient();
  if (resourceId === null) {
    const { error } = await supabase.from("resources").insert({ ...row, classroom_id: classroomId });
    if (error) {
      if (error.code === "42501") return { error: NOT_MANAGER, values };
      return { ...failed("add", error.message), values };
    }
    refresh();
    return { ok: "Added.", values: {} };
  }

  const { data, error } = await supabase.from("resources").update(row).eq("id", resourceId).select("id");
  if (error) {
    if (error.code === "42501") return { error: NOT_MANAGER, values };
    return { ...failed("edit", error.message), values };
  }
  if (!data?.length) return { error: NOT_MANAGER, values };
  refresh();
  return { ok: "Saved.", values };
}

export async function deleteResource(classroomId: string, resourceId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success || !id.safeParse(resourceId).success) return { error: "That link doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("resources").delete().eq("id", resourceId).select("id");
  if (error) {
    if (error.code === "42501") return { error: NOT_MANAGER };
    return failed("delete", error.message);
  }
  if (!data?.length) return { error: NOT_MANAGER };
  refresh();
  return { ok: "Deleted." };
}

// Replaces the whole breakdown at once. Fields repeat per row: "topic" and "percent".
export async function saveTopics(classroomId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success) return { error: "That classroom doesn't exist." };
  const topics = form.getAll("topic").map((v) => String(v ?? ""));
  const percents = form.getAll("percent").map((v) => String(v ?? ""));
  const parsed = parseTopics(topics.map((topic, i) => ({ topic, percent: percents[i] ?? "" })));
  if (parsed.error) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_topic_weights", { cid: classroomId, items: parsed.items });
  if (error) {
    if (error.code === "42501") return { error: NOT_MANAGER };
    return failed("topics", error.message);
  }
  refresh();
  return { ok: "Saved." };
}
