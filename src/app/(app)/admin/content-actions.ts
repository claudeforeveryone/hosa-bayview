"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireRole } from "@/lib/auth";
import { removeClassroomFiles } from "@/lib/material-cleanup";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();
const TABLES = {
  classroom: "classrooms",
  test: "tests",
  deck: "decks",
} as const;
export type ContentKind = keyof typeof TABLES;

// Admin clean-up: delete a classroom, test or deck from the content lists. Executives only, and RLS checks
// again in the database. Stays on /admin (the owners' own delete buttons redirect away).
export async function adminDelete(
  kind: ContentKind,
  rowId: string,
): Promise<FormState> {
  await requireRole("executive");
  if (!Object.hasOwn(TABLES, kind) || !id.safeParse(rowId).success)
    return { error: "That doesn't exist." };
  const supabase = await createClient();
  if (kind === "classroom") await removeClassroomFiles(supabase, rowId);
  const { data, error } = await supabase
    .from(TABLES[kind])
    .delete()
    .eq("id", rowId)
    .select("id");
  if (error) {
    console.error(`[admin:delete-${kind}]`, error.message);
    return { error: "That didn't delete. Try again." };
  }
  if (!data?.length)
    return { error: "It's already gone, or you can't delete it." };
  refresh();
  return { ok: "Deleted." };
}
