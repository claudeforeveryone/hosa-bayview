import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// Deleting a classroom cascades its materials rows but not the files behind them. Call this right before the
// delete: storage only lets the room's managers remove its files while the room still exists. Clean-up never
// blocks the delete; a failure only leaves unreachable files, and is logged.
export async function removeClassroomFiles(
  supabase: Client,
  classroomId: string,
) {
  try {
    const { data } = await supabase
      .from("materials")
      .select("path")
      .eq("classroom_id", classroomId);
    const paths = ((data ?? []) as { path: string | null }[]).flatMap((r) =>
      r.path ? [r.path] : [],
    );
    if (!paths.length) return;
    const { data: gone, error } = await supabase.storage
      .from("materials")
      .remove(paths);
    if (error) console.error("[materials:cleanup]", error.message);
    else if ((gone?.length ?? 0) < paths.length)
      console.error(
        "[materials:cleanup]",
        `removed ${gone?.length ?? 0} of ${paths.length} files`,
      );
  } catch (e) {
    console.error("[materials:cleanup]", e);
  }
}
