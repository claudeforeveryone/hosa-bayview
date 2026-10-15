"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { AVATAR_BUCKET } from "@/lib/avatar";
import { BAN_CHOICES, banUntil } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/server";

export type ModState = { error?: string; ok?: string };

const uuid = z.string().uuid();
const GONE = "That person is gone. Reload the page.";

// The database writes its refusals as plain sentences for P0001, P0002 and 22023. Permission refusals (42501)
// and anything unexpected get a short line here, and the detail goes to the server log.
function explain(error: { code?: string; message: string }): string {
  // The function isn't on the database yet (a deploy ahead of its migration).
  if (error.code === "PGRST202")
    return "This needs the latest database update. Ask the developer to apply it.";
  if (error.code === "42501")
    return "Only executives can do that here. Demo accounts can't.";
  if (
    error.code === "P0001" ||
    error.code === "P0002" ||
    error.code === "22023"
  )
    return error.message;
  console.error("[admin] moderation:", error.message);
  return "Couldn't do that. Try again.";
}

// The person named in the form. Null means the form was tampered with or the id is stale.
function target(form: FormData): string | null {
  const parsed = uuid.safeParse(form.get("userId"));
  return parsed.success ? parsed.data : null;
}

export async function warnMember(
  _: ModState,
  form: FormData,
): Promise<ModState> {
  await requireRole("executive");
  const userId = target(form);
  if (!userId) return { error: GONE };
  const message = String(form.get("message") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("warn_member", {
    p_user: userId,
    p_message: message,
  });
  if (error) return { error: explain(error) };
  refresh();
  return {
    ok: "Warning sent. It stays at the top of their screen until they click Got it.",
  };
}

// Takes a warning back: it leaves their screen and this list, and the admin log keeps a line for it.
export async function removeWarning(
  _: ModState,
  form: FormData,
): Promise<ModState> {
  await requireRole("executive");
  const parsed = uuid.safeParse(form.get("warningId"));
  if (!parsed.success) return { error: "That warning is already gone. Reload the page." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_warning", { p_id: parsed.data });
  if (error) return { error: explain(error) };
  refresh();
  return { ok: "Warning removed." };
}

export async function banMember(
  _: ModState,
  form: FormData,
): Promise<ModState> {
  await requireRole("executive");
  const userId = target(form);
  if (!userId) return { error: GONE };
  const choice = z.enum(BAN_CHOICES).safeParse(form.get("choice"));
  if (!choice.success) return { error: "Pick how long the ban lasts." };
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length > 200)
    return { error: "Keep the reason under 200 characters." };

  const until = banUntil(
    choice.data,
    new Date(),
    String(form.get("custom_day") ?? ""),
  );
  if (until === null)
    return {
      error:
        choice.data === "custom"
          ? "Pick a date that's still to come."
          : "Couldn't work out that time.",
    };

  const supabase = await createClient();
  const { error } = await supabase.rpc("ban_member", {
    p_user: userId,
    // "infinity" is Postgres' own word for never ending; the column stores it as-is.
    p_until: until === "permanent" ? "infinity" : until.toISOString(),
    p_reason: reason || null,
  });
  if (error) return { error: explain(error) };
  refresh();
  return { ok: "Banned. Their sessions are ended." };
}

export async function unbanMember(
  _: ModState,
  form: FormData,
): Promise<ModState> {
  await requireRole("executive");
  const userId = target(form);
  if (!userId) return { error: GONE };

  const supabase = await createClient();
  const { error } = await supabase.rpc("unban_member", { p_user: userId });
  if (error) return { error: explain(error) };
  refresh();
  return { ok: "Ban lifted." };
}

// Removes the account. The name has to be typed to match, checked here as well as in the form.
export async function removeMember(
  _: ModState,
  form: FormData,
): Promise<ModState> {
  await requireRole("executive");
  const userId = target(form);
  if (!userId) return { error: GONE };

  const supabase = await createClient();
  const { data: person, error: readError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  if (readError) return { error: explain(readError) };
  if (!person) return { error: GONE };

  const typed = String(form.get("confirm_name") ?? "")
    .trim()
    .toLowerCase();
  if (typed !== String(person.full_name).trim().toLowerCase()) {
    return { error: "Type their name exactly as shown to remove them." };
  }

  const { data: picturePath, error } = await supabase.rpc("remove_member", {
    p_user: userId,
  });
  if (error) return { error: explain(error) };
  // The account is gone; its picture file goes too. A failed file delete only leaves an orphan, so log it.
  if (typeof picturePath === "string" && picturePath) {
    const { error: removeError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([picturePath]);
    if (removeError)
      console.error("[admin] remove picture file:", removeError.message);
  }
  refresh();
  return { ok: "Account removed." };
}
