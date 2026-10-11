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

// Your own read and deleted marks (0280). Nobody else can see them. Empty while the table isn't there yet.
export type AnnouncementState = { read: boolean; deleted: boolean };

export async function getAnnouncementStates(ids: string[]): Promise<Map<string, AnnouncementState>> {
  const out = new Map<string, AnnouncementState>();
  const wanted = ids.filter((i) => uuid.safeParse(i).success);
  if (!wanted.length) return out;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcement_states")
    .select("announcement_id, read_at, deleted_at")
    .in("announcement_id", wanted);
  if (error) {
    // 42P01: the table isn't on this database yet; everything reads as new.
    if (error.code !== "42P01") console.error("[announcements:states]", error.message);
    return out;
  }
  for (const r of data ?? [])
    out.set(r.announcement_id as string, { read: r.read_at !== null, deleted: r.deleted_at !== null });
  return out;
}

export async function getAnnouncement(id: string): Promise<(AnnouncementRow & { classroom_id: string | null }) | null> {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select(
      "id, classroom_id, title, body, pinned, created_at, updated_at, author:profiles!announcements_author_id_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Announcement lookup failed: ${error.message}`);
  return (data ?? null) as unknown as (AnnouncementRow & { classroom_id: string | null }) | null;
}
