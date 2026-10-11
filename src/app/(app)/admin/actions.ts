"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { CHAPTER_CODE_MAX, CHAPTER_CODE_MIN, rpcMissing } from "@/lib/chapter-code";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

export type RoleState = { error?: string };

const role = z.enum(["executive", "trainer", "trainee", "jobless"]);

export async function setRole(userId: string, _: RoleState, form: FormData): Promise<RoleState> {
  await requireRole("executive");
  const parsed = z.object({ userId: uuid, role }).safeParse({ userId, role: form.get("role") });
  if (!parsed.success) return { error: "Pick a role." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId)
    .select("id");
  if (error) {
    if (error.code === "P0001") return { error: "There has to be at least one executive." };
    if (error.code === "42501") return { error: "Only the chapter leads can give or remove executive." };
    console.error("[admin] role:", error.message);
    return { error: "Couldn't change that. Try again." };
  }
  if (!data?.length) return { error: "That person is gone. Reload the page." };
  refresh();
  return {};
}

export type ChapterCodeState = { error?: string; ok?: string; codeError?: string };

const CHAPTER_CODE_DENIED = "Only executives can change the chapter code.";
const CHAPTER_CODE_PENDING = "The chapter code isn't set up yet.";

// Sets or changes the chapter code new members need to sign up. The RPC checks executive, not banned, and
// length again, stores only a bcrypt hash, and tells the other executives.
export async function setChapterCode(_: ChapterCodeState, form: FormData): Promise<ChapterCodeState> {
  await requireRole("executive");
  const code = String(form.get("chapter_code") ?? "").trim();
  // Count characters the way Postgres char_length does (code points), not UTF-16 units.
  const length = [...code].length;
  if (length < CHAPTER_CODE_MIN) return { codeError: `Use at least ${CHAPTER_CODE_MIN} characters.` };
  if (length > CHAPTER_CODE_MAX) return { codeError: `Keep it under ${CHAPTER_CODE_MAX} characters.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chapter_passcode", { code });
  if (error) {
    if (error.code === "42501") return { error: CHAPTER_CODE_DENIED };
    if (rpcMissing(error.code)) return { error: CHAPTER_CODE_PENDING };
    console.error("[admin] chapter code:", error.message);
    return { error: "Couldn't save that. Try again." };
  }
  refresh();
  return { ok: "Chapter code set." };
}

// Clears it, so anyone with the link can sign up again.
export async function clearChapterCode(): Promise<ChapterCodeState> {
  await requireRole("executive");
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_chapter_passcode");
  if (error) {
    if (error.code === "42501") return { error: CHAPTER_CODE_DENIED };
    if (rpcMissing(error.code)) return { error: CHAPTER_CODE_PENDING };
    console.error("[admin] chapter code:", error.message);
    return { error: "Couldn't clear that. Try again." };
  }
  refresh();
  return { ok: "Chapter code cleared." };
}
