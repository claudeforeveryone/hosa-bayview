"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireProfile } from "@/lib/auth";
import { parseTopics } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

const NOT_MANAGER = "Only the trainer or an executive can change this.";

function failed(where: string, message: string): FormState {
  console.error(`[resources:${where}]`, message);
  return { error: "That didn't save. Try again." };
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
