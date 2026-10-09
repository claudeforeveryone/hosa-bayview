"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type WarningState = { error?: string };

// "Got it" on the warning banner. The database only lets you clear your own warnings.
export async function acknowledgeWarning(id: string): Promise<WarningState> {
  await requireProfile();
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success)
    return { error: "Couldn't clear that. Reload the page." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_warning", {
    p_id: parsed.data,
  });
  if (error) {
    console.error("[warning] acknowledge:", error.message);
    return { error: "Couldn't clear that. Try again." };
  }
  refresh();
  return {};
}
