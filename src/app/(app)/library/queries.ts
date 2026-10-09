import "server-only";
import { cache } from "react";
import { uuid } from "@/lib/classrooms";
import { type MaterialItem, type MaterialRow } from "@/lib/materials";
import { createClient } from "@/lib/supabase/server";

const LINK_SECONDS = 3600;

// Chapter-wide rows when classroomId is null, otherwise that classroom's. RLS hides what you can't see.
// Files get a signed link that downloads under the file's own name.
export const getMaterials = cache(async (classroomId: string | null): Promise<MaterialItem[]> => {
  if (classroomId !== null && !uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const base = supabase
    .from("materials")
    .select("id, classroom_id, title, note, url, path, file_name, size_bytes, mime, created_at");
  const { data, error } = await (classroomId === null
    ? base.is("classroom_id", null)
    : base.eq("classroom_id", classroomId)
  ).order("created_at", { ascending: false });
  if (error) throw new Error(`Library lookup failed: ${error.message}`);
  const rows = (data ?? []) as MaterialRow[];

  const paths = rows.flatMap((r) => (r.path ? [r.path] : []));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls, error: signError } = await supabase.storage
      .from("materials")
      .createSignedUrls(paths, LINK_SECONDS);
    // A signing failure only breaks the file links, not the whole page.
    if (signError) console.error("[library:sign]", signError.message);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  return rows.map((r) => {
    if (r.url) return { ...r, href: r.url };
    const url = r.path ? signed.get(r.path) : undefined;
    // The download param is added after signing, the same way the client library does it.
    const href = url && r.file_name ? `${url}&download=${encodeURIComponent(r.file_name)}` : (url ?? null);
    return { ...r, href };
  });
});
