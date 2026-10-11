"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { isIsoDate } from "@/lib/attendance";
import { requireProfile } from "@/lib/auth";
import { normalizeName, normalizeShortCode } from "@/lib/roster";
import { createClient } from "@/lib/supabase/server";

// Weekly attendance tracker writes. RLS decides who may do what (0103): a class's managers and executives
// for names and marks, executives for meeting dates and class codes. Each tick is one upsert.

const id = z.string().uuid();
const ids = z.array(id).min(1).max(500);
const GENERIC = "That didn't save. Try again.";
const NOT_ALLOWED =
  "Only this event's trainer or an executive can change its attendance.";

type Result = { ok: true } | { ok: false; error: string };

function failMessage(
  tag: string,
  error: { code?: string; message: string },
): string {
  if (error.code === "42501") return NOT_ALLOWED;
  console.error(`[roster:${tag}]`, error.message);
  return GENERIC;
}

// Tick or untick one person for one meeting.
export async function setRosterMark(
  memberId: string,
  weekId: string,
  present: boolean,
): Promise<Result> {
  await requireProfile();
  if (
    !id.safeParse(memberId).success ||
    !id.safeParse(weekId).success ||
    typeof present !== "boolean"
  )
    return { ok: false, error: GENERIC };
  const supabase = await createClient();
  const { error } = await supabase
    .from("roster_marks")
    .upsert(
      { member_id: memberId, week_id: weekId, present },
      { onConflict: "member_id,week_id" },
    );
  return error
    ? { ok: false, error: failMessage("mark", error) }
    : { ok: true };
}

// Everyone in a class present for one meeting, in one upsert.
export async function markAllPresent(
  memberIds: string[],
  weekId: string,
): Promise<Result> {
  await requireProfile();
  const parsed = ids.safeParse(memberIds);
  if (!parsed.success || !id.safeParse(weekId).success)
    return { ok: false, error: GENERIC };
  const supabase = await createClient();
  const { error } = await supabase.from("roster_marks").upsert(
    parsed.data.map((m) => ({ member_id: m, week_id: weekId, present: true })),
    { onConflict: "member_id,week_id" },
  );
  return error
    ? { ok: false, error: failMessage("mark-all", error) }
    : { ok: true };
}

const memberForm = z.object({
  name: z
    .string()
    .transform(normalizeName)
    .pipe(
      z
        .string()
        .min(1, "Type a name.")
        .max(80, "Keep the name under 80 characters."),
    ),
  grade: z
    .string()
    .transform((g) => (g === "" ? null : Number(g)))
    .pipe(z.number().int().min(9).max(12).nullable()),
});

// Adds a name to the bottom of a class's roster.
export async function addRosterMember(
  classroomId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success)
    return { error: "That event doesn't exist." };
  const parsed = memberForm.safeParse({
    name: String(form.get("name") ?? ""),
    grade: String(form.get("grade") ?? ""),
  });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "Check the name and grade.",
    };

  const supabase = await createClient();
  const last = await supabase
    .from("roster_members")
    .select("position")
    .eq("classroom_id", classroomId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) return { error: failMessage("add", last.error) };
  const { error } = await supabase.from("roster_members").insert({
    classroom_id: classroomId,
    full_name: parsed.data.name,
    grade: parsed.data.grade,
    position: (last.data?.position ?? 0) + 1,
  });
  if (error) {
    if (error.code === "23505")
      return { error: `${parsed.data.name} is already on this roster.` };
    return { error: failMessage("add", error) };
  }
  refresh();
  return { ok: `Added ${parsed.data.name}.` };
}

// Removes a name and, through the foreign key, every mark it had.
export async function removeRosterMember(memberId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(memberId).success) return { error: GENERIC };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roster_members")
    .delete()
    .eq("id", memberId)
    .select("id");
  if (error) {
    return { error: failMessage("remove", error) };
  }
  if (!data?.length) return { error: NOT_ALLOWED };
  refresh();
  return { ok: "Removed." };
}

// A new chapter meeting date: a new column on every class's sheet. Executives only (RLS).
export async function addRosterWeek(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const date = String(form.get("date") ?? "");
  if (!isIsoDate(date)) return { error: "Pick a date." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("roster_weeks")
    .insert({ meet_on: date });
  if (error) {
    if (error.code === "23505")
      return { error: "That date is already on the sheet." };
    if (error.code === "42501")
      return { error: "Only executives can add meeting dates." };
    console.error("[roster:week]", error.message);
    return { error: GENERIC };
  }
  refresh();
  return { ok: "Date added." };
}

// A class's short code ("FS"); empty clears it. Executives only (trigger in 0103).
export async function setShortCode(
  classroomId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success)
    return { error: "That event doesn't exist." };
  const code = normalizeShortCode(String(form.get("code") ?? ""));
  if (code === null) return { error: "Use 2 to 4 letters, like FS." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .update({ short_code: code === "" ? null : code })
    .eq("id", classroomId)
    .select("id");
  if (error) {
    if (error.code === "23505")
      return { error: `${code} is already used by another event.` };
    if (error.code === "42501")
      return { error: "Only executives can set event codes." };
    console.error("[roster:code]", error.message);
    return { error: GENERIC };
  }
  if (!data?.length) return { error: "Only executives can set event codes." };
  refresh();
  return { ok: code ? `Code set to ${code}.` : "Code cleared." };
}
