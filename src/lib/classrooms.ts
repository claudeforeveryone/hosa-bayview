import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth";
import { type Category, parseCategory } from "@/lib/classroom-tabs";

export type ClassroomSummary = {
  id: string;
  num: number;
  name: string;
  event: string;
  description: string;
  owner_name: string | null;
  member_count: number;
  is_owner: boolean;
  can_manage: boolean;
  join_code: string | null;
  created_at: string;
  category: Category | null;
};

export type ClassroomDetail = ClassroomSummary & { owner_id: string | null; is_member: boolean };

export type RosterRow = { user_id: string; full_name: string; email: string | null; role: Role; joined_at: string };

export const uuid = z.string().uuid();

// Cached per request: the app layout (sidebar) and the page both read it.
export const getMyClassrooms = cache(async (): Promise<ClassroomSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_classrooms");
  if (error) throw new Error(`Classrooms lookup failed: ${error.message}`);
  // The category comes back raw; anything unknown reads as uncategorised.
  return ((data ?? []) as (Omit<ClassroomSummary, "category"> & { category: string | null })[]).map((r) => ({
    ...r,
    category: parseCategory(r.category),
  }));
});

// Null when the id is malformed or you can't see the classroom; both read as "not found".
// Cached per request so the classroom layout and its tab page share one lookup.
export const getClassroom = cache(async (id: string): Promise<ClassroomDetail | null> => {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("classroom_detail", { cid: id }).maybeSingle();
  if (error) throw new Error(`Classroom lookup failed: ${error.message}`);
  return (data as ClassroomDetail | null) ?? null;
});

// Kind (class or competition) and event category, read straight off the row. Cached per request:
// the classroom layout, its tabs and the hub all need them. Null when malformed or not visible.
export const getRoomInfo = cache(
  async (id: string): Promise<{ kind: string | null; category: Category | null } | null> => {
    if (!uuid.safeParse(id).success) return null;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("classrooms")
      .select("kind, category")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Classroom lookup failed: ${error.message}`);
    if (!data) return null;
    return { kind: data.kind ?? null, category: parseCategory(data.category) };
  },
);

export async function getRoster(id: string): Promise<RosterRow[]> {
  if (!uuid.safeParse(id).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("classroom_roster", { cid: id });
  if (error) throw new Error(`Roster lookup failed: ${error.message}`);
  return (data ?? []) as RosterRow[];
}

export type Runner = { user_id: string; full_name: string; lead: boolean };

// Who runs the room (0291): its leads in order, or the account that made it when it has none (lead false).
// Null when the database doesn't have classroom_runners yet, so callers fall back to the owner.
export async function getRunners(id: string): Promise<Runner[] | null> {
  if (!uuid.safeParse(id).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("classroom_runners", { cid: id });
  if (error) {
    if (error.code !== "PGRST202") console.error("[classrooms] runners:", error.message);
    return null;
  }
  return (data ?? []) as Runner[];
}
