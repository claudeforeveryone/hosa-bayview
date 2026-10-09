import "server-only";
import { uuid } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  author: { full_name: string } | null;
};

// Chapter-wide when classroomId is null. Pinned first, then newest. RLS decides what you can read.
export async function getAnnouncements(
  classroomId: string | null,
  limit = 50,
): Promise<AnnouncementRow[]> {
  if (classroomId !== null && !uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  let query = supabase
    .from("announcements")
    .select(
      "id, title, body, pinned, created_at, updated_at, author:profiles!announcements_author_id_fkey(full_name)",
    )
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  query =
    classroomId === null
      ? query.is("classroom_id", null)
      : query.eq("classroom_id", classroomId);
  const { data, error } = await query;
  if (error) throw new Error(`Announcements lookup failed: ${error.message}`);
  return (data ?? []) as unknown as AnnouncementRow[];
}
