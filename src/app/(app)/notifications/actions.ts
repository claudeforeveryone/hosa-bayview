"use server";

import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Marks notifications read: the ones given, or all of them when `ids` is null. The database function only ever
// touches your own rows.
async function mark(ids: string[] | null): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { ids });
  if (error) {
    console.error("[notifications:read]", error.message);
    return { error: "Couldn't mark them read." };
  }
  return {};
}

export async function markAllRead(): Promise<{ error?: string }> {
  return mark(null);
}

const ids = z.array(z.string().uuid()).min(1).max(100);

export async function markRead(list: string[]): Promise<{ error?: string }> {
  const parsed = ids.safeParse(list);
  if (!parsed.success) return { error: "Couldn't mark that read." };
  return mark(parsed.data);
}
