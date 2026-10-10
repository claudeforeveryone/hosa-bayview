import "server-only";
import { cache } from "react";
import { uuid } from "@/lib/classrooms";
import { type MaterialItem, type MaterialRow, materialHref } from "@/lib/materials";
import { createClient } from "@/lib/supabase/server";

// Chapter-wide rows when classroomId is null, otherwise that classroom's. RLS hides what you can't see.
// Files and links open through /files/<id>, which signs a fresh link on each click (src/app/files/[id]).
export const getMaterials = cache(async (classroomId: string | null): Promise<MaterialItem[]> => {
  if (classroomId !== null && !uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const base = supabase
    .from("materials")
    .select("id, classroom_id, title, note, section, url, path, file_name, size_bytes, mime, created_at");
  const { data, error } = await (classroomId === null
    ? base.is("classroom_id", null)
    : base.eq("classroom_id", classroomId)
  ).order("created_at", { ascending: false });
  if (error) throw new Error(`Resources lookup failed: ${error.message}`);
  return ((data ?? []) as MaterialRow[]).map((r) => ({ ...r, href: materialHref(r) }));
});
