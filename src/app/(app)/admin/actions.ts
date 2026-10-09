"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

export type RoleState = { error?: string };

const role = z.enum(["executive", "trainer", "trainee"]);

export async function setRole(userId: string, _: RoleState, form: FormData): Promise<RoleState> {
  await requireRole("executive");
  const parsed = z.object({ userId: uuid, role }).safeParse({ userId, role: form.get("role") });
  if (!parsed.success) return { error: "Pick a role." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId)
    .select("id");
  if (error) {
    if (error.code === "P0001") return { error: "There has to be at least one executive." };
    console.error("[admin] role:", error.message);
    return { error: "Couldn't change that. Try again." };
  }
  if (!data?.length) return { error: "That person is gone. Reload the page." };
  refresh();
  return {};
}
