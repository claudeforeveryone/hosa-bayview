"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Marks every notification you have as read. The function only ever touches your own rows.
export async function markAllRead(): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", {
    ids: null,
  });
  if (error) {
    console.error("[notifications:read]", error.message);
    return { error: "Couldn't mark them read." };
  }
  return {};
}
