"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { isStatus, isWeekStart, type Status } from "@/lib/attendance";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

const NOT_MANAGER =
  "Only the trainer or an executive can take attendance here.";
const GENERIC = "That didn't save. Try again.";

// Submits a new week, or saves edits to one, in a single database call. statuses arrives as JSON:
// {"<member id>": "present", ...}; members left out are unmarked.
export async function saveAttendance(
  classroomId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success)
    return { error: "That event doesn't exist." };

  const week = String(form.get("week") ?? "");
  if (!isWeekStart(week)) return { error: "Pick a real week." };
  const note = String(form.get("note") ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (note.length > 500)
    return { error: "Keep the note under 500 characters." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("statuses") ?? "{}"));
  } catch {
    return { error: GENERIC };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { error: GENERIC };
  const statuses: Record<string, Status> = {};
  for (const [userId, status] of Object.entries(raw)) {
    if (!id.safeParse(userId).success || !isStatus(status))
      return { error: GENERIC };
    statuses[userId] = status;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_attendance_week", {
    p_classroom: classroomId,
    p_week: week,
    p_note: note,
    p_statuses: statuses,
  });
  if (error) {
    if (error.code === "42501") return { error: NOT_MANAGER };
    // Plain-language messages from the database (note too long, unknown status) pass through.
    if (error.code === "22023") return { error: error.message };
    console.error("[attendance:save]", error.message);
    return { error: GENERIC };
  }
  refresh();
  return { ok: "Saved." };
}
