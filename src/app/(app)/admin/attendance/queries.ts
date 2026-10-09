import "server-only";
import { cache } from "react";
import {
  compareParticipation,
  currentWeek,
  fetchAllPages,
  isStatus,
  summarizeMembers,
  torontoToday,
  type MarkRow,
  type Page,
  type Participation,
  type Status,
} from "@/lib/attendance";
import { absenceLeaders, type Meeting } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";

type ClassroomDb = { id: string; name: string };
type SessionDb = {
  id: string;
  classroom_id: string;
  week_start: string;
  submitted_at: string;
  updated_at: string | null;
};
type MarkDb = { session_id: string; user_id: string; status: string };

export type WeekStatus = {
  classroom_id: string;
  name: string;
  state: "Submitted" | "Edited" | "Not submitted";
  submitted_at: string | null;
  updated_at: string | null;
  // The roll as taken this week, by name. Empty until submitted.
  roll: { user_id: string; name: string; status: Status }[];
};

export type MemberRow = Participation & { name: string };

// Executives read every room, session and mark through RLS. Everything is read page by page
// because PostgREST stops each request at 1000 rows.
export const loadAttendanceOverview = cache(async () => {
  const supabase = await createClient();
  const [classrooms, sessions, marks, profiles] = await Promise.all([
    fetchAllPages<ClassroomDb>(
      (from, to) =>
        supabase
          .from("classrooms")
          .select("id, name")
          .order("name")
          .order("id")
          .range(from, to) as unknown as Page<ClassroomDb>,
    ),
    fetchAllPages<SessionDb>(
      (from, to) =>
        supabase
          .from("attendance_sessions")
          .select("id, classroom_id, week_start, submitted_at, updated_at")
          .order("week_start", { ascending: false })
          .order("id")
          .range(from, to) as unknown as Page<SessionDb>,
    ),
    fetchAllPages<MarkDb>(
      (from, to) =>
        supabase
          .from("attendance_marks")
          .select("session_id, user_id, status")
          .order("session_id")
          .order("user_id")
          .range(from, to) as unknown as Page<MarkDb>,
    ),
    fetchAllPages<{ id: string; full_name: string; role: string }>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id, full_name, role")
          .order("id")
          .range(from, to) as unknown as Page<{
          id: string;
          full_name: string;
          role: string;
        }>,
    ),
  ]);

  const meetings = await fetchAllPages<Meeting>(
    (from, to) =>
      supabase
        .from("chapter_meetings")
        .select("id, meets_on, week_start, title, kind")
        .order("meets_on")
        .range(from, to) as unknown as Page<Meeting>,
  );

  const cleanMarks: MarkRow[] = marks.flatMap((m) =>
    isStatus(m.status)
      ? [{ session_id: m.session_id, user_id: m.user_id, status: m.status }]
      : [],
  );
  const names = new Map(profiles.map((p) => [p.id, p.full_name]));
  const week = currentWeek();
  const thisWeek = sessions.filter((s) => s.week_start === week);
  const weekStatus: WeekStatus[] = classrooms
    .map((c): WeekStatus => {
      const s = thisWeek.find((x) => x.classroom_id === c.id) ?? null;
      return {
        classroom_id: c.id,
        name: c.name,
        state: !s ? "Not submitted" : s.updated_at ? "Edited" : "Submitted",
        submitted_at: s?.submitted_at ?? null,
        updated_at: s?.updated_at ?? null,
        roll: s
          ? cleanMarks
              .filter((m) => m.session_id === s.id)
              .map((m) => ({
                user_id: m.user_id,
                name: names.get(m.user_id) || "Former member",
                status: m.status,
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
          : [],
      };
    })
    // Rooms still to submit come first.
    .sort(
      (a, b) =>
        Number(a.state !== "Not submitted") -
          Number(b.state !== "Not submitted") || a.name.localeCompare(b.name),
    );

  const members: MemberRow[] = summarizeMembers(cleanMarks)
    .map((m) => ({ ...m, name: names.get(m.user_id) || "Former member" }))
    .sort(compareParticipation);

  // Most absences across every classroom, counting only meetings that have passed.
  // Executives can't be warned (warn_member), so their rows carry no Warn button.
  const executives = new Set(
    profiles.filter((p) => p.role === "executive").map((p) => p.id),
  );
  const absences = absenceLeaders({
    meetings,
    sessions: sessions.map((s) => ({
      session_id: s.id,
      week_start: s.week_start,
    })),
    marks: cleanMarks,
    names,
    today: torontoToday(),
  }).map((a) => ({ ...a, warnable: !executives.has(a.user_id) }));

  return {
    week,
    weekStatus,
    absences,
    members,
    perfect: members.filter((m) => m.flag === "perfect"),
    checkIn: members.filter((m) => m.flag === "check-in"),
  };
});
