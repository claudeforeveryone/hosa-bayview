"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/app/(app)/c/actions";
import { requireProfile } from "@/lib/auth";
import {
  FORMATS,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  normalizeBattleCode,
} from "@/lib/battle";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

const setup = z.object({
  format: z.enum(FORMATS, { error: "Pick a format." }),
  source: z.union([z.literal("all"), z.string().uuid()], {
    error: "Pick what to play.",
  }),
  count: z.coerce
    .number({ error: "Pick how many questions." })
    .int()
    .min(MIN_QUESTIONS, `Pick ${MIN_QUESTIONS} to ${MAX_QUESTIONS} questions.`)
    .max(MAX_QUESTIONS, `Pick ${MIN_QUESTIONS} to ${MAX_QUESTIONS} questions.`),
});

// The RPCs raise plain-language messages: 22023 for a bad move, 42501 for not allowed, P0002 for no battle.
function rpcError(
  where: string,
  error: { code?: string; message: string },
): FormState {
  if (error.code === "22023" || error.code === "P0002")
    return { error: `${error.message}.` };
  if (error.code === "42501")
    return { error: "You can't battle in this event." };
  console.error(`[battles:${where}]`, error.message);
  return { error: "That didn't work. Try again." };
}

// Host a battle from the setup page, then go to its lobby.
export async function createBattle(
  classroomId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(classroomId).success)
    return { error: "That event doesn't exist." };
  const values = {
    format: String(form.get("format") ?? ""),
    source: String(form.get("source") ?? ""),
    count: String(form.get("count") ?? ""),
  };
  const parsed = setup.safeParse(values);
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form.",
      values,
    };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_battle", {
    cid: classroomId,
    p_format: parsed.data.format,
    p_test: parsed.data.source === "all" ? null : parsed.data.source,
    p_count: parsed.data.count,
  });
  if (error) return { ...rpcError("create", error), values };
  redirect(`/battle/${data}`);
}

// Join by the 4-character code (the field on /events).
export async function joinBattleByCode(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const raw = String(form.get("code") ?? "");
  const values = { code: raw };
  const code = normalizeBattleCode(raw);
  if (!code)
    return {
      fieldErrors: { code: "Battle codes are 4 characters, like K7PQ." },
      values,
    };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_battle_code", {
    p_code: code,
  });
  if (error) {
    if (error.code === "P0002")
      return { fieldErrors: { code: "No live battle has that code." }, values };
    return { ...rpcError("join-code", error), values };
  }
  redirect(`/battle/${data}`);
}

// Join from the event page's "Join battle" row.
export async function joinBattle(battleId: string): Promise<FormState> {
  await requireProfile();
  if (!id.safeParse(battleId).success)
    return { error: "That battle doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_battle", { bid: battleId });
  if (error) return rpcError("join", error);
  redirect(`/battle/${battleId}`);
}
