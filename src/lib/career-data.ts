import "server-only";
import type { CareerRow } from "@/lib/activity-data";
import { uuid } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";

// A career row with its question and whether the viewer starred it (career_items, migration 0100).
export type CareerItemRow = CareerRow & { question_id: string | null; favorite: boolean };

// Answered questions for one member, newest first (at most 500). The database limits this to what you may see.
// Falls back to the older career RPC, without stars, if 0100 isn't applied yet.
export async function getCareerItems(userId: string): Promise<CareerItemRow[]> {
  if (!uuid.safeParse(userId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("career_items", { uid: userId, cid: null });
  if (!error) return (data ?? []) as CareerItemRow[];
  if (error.code !== "PGRST202") throw new Error(`Career lookup failed: ${error.message}`);
  const old = await supabase.rpc("career", { uid: userId, cid: null });
  if (old.error) throw new Error(`Career lookup failed: ${old.error.message}`);
  return ((old.data ?? []) as CareerRow[]).map((r) => ({ ...r, question_id: null, favorite: false }));
}
