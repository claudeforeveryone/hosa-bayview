import "server-only";
import { cache } from "react";
import {
  fetchAllPages,
  isStatus,
  type MarkRow,
  type Page,
} from "@/lib/attendance";
import { uuid } from "@/lib/classrooms";
import type { Meeting } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";

// One submitted week. Names come from the RPC, so members see trainer names without profile access.
export type WeekRow = {
  session_id: string;
  week_start: string;
  submitted_at: string;
  submitted_by_name: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};

// Every submitted week in the room, newest first. The RPC returns nothing for people who can't see the room.
export const getWeeks = cache(
  async (classroomId: string): Promise<WeekRow[]> => {
    if (!uuid.safeParse(classroomId).success) return [];
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("attendance_weeks", {
      cid: classroomId,
    });
    if (error) throw new Error(`Attendance lookup failed: ${error.message}`);
    return (data ?? []) as WeekRow[];
  },
);

// Trainers and executives only. The RPC returns no rows for anyone else.
export const getSessionNotes = cache(
  async (classroomId: string): Promise<Map<string, string>> => {
    if (!uuid.safeParse(classroomId).success) return new Map();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("attendance_session_notes", {
      cid: classroomId,
    });
    if (error) throw new Error(`Session notes lookup failed: ${error.message}`);
    const rows = (data ?? []) as { session_id: string; session_note: string }[];
    return new Map(rows.map((r) => [r.session_id, r.session_note]));
  },
);

type MarkDbRow = { session_id: string; user_id: string; status: string };

// Managers get every mark in the room; members get only their own (RLS decides, not this query).
export const getClassroomMarks = cache(
  async (classroomId: string): Promise<MarkRow[]> => {
    if (!uuid.safeParse(classroomId).success) return [];
    const supabase = await createClient();
    const rows = await fetchAllPages<MarkDbRow>(
      (from, to) =>
        supabase
          .from("attendance_marks")
          .select(
            "session_id, user_id, status, attendance_sessions!inner(classroom_id)",
          )
          .eq("attendance_sessions.classroom_id", classroomId)
          .order("session_id")
          .order("user_id")
          .range(from, to) as unknown as Page<MarkDbRow>,
    );
    return rows.flatMap((r) =>
      isStatus(r.status)
        ? [{ session_id: r.session_id, user_id: r.user_id, status: r.status }]
        : [],
    );
  },
);

// The chapter schedule, oldest first. Every signed-in member can read it.
export const getMeetings = cache(async (): Promise<Meeting[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chapter_meetings")
    .select("id, meets_on, week_start, title, kind")
    .order("meets_on");
  if (error) throw new Error(`Meetings lookup failed: ${error.message}`);
  return (data ?? []) as Meeting[];
});

// Each member's picture path, for roster pictures. The signed URLs come from avatarSources (server only).
export const getPicturePaths = cache(
  async (): Promise<Map<string, string | null>> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("member_details");
    if (error) throw new Error(`Pictures lookup failed: ${error.message}`);
    const rows = (data ?? []) as { user_id: string; avatar_path: string | null }[];
    return new Map(rows.map((r) => [r.user_id, r.avatar_path]));
  },
);
