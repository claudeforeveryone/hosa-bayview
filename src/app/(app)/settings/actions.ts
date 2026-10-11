"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { AuthState } from "@/app/(auth)/actions";
import { requireProfile } from "@/lib/auth";
import { parseGrade } from "@/lib/profile";
import { forgetOtherDevices } from "@/lib/push/forget";
import { createClient } from "@/lib/supabase/server";

// Empty means no grade. Anything else has to be 9 to 12.
export async function updateGrade(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  const profile = await requireProfile();
  const raw = String(form.get("grade") ?? "").trim();
  const grade = parseGrade(raw);
  const values = { grade: raw };
  if (raw && grade === null)
    return {
      fieldErrors: { grade: "Pick a grade from 9 to 12, or none." },
      values,
    };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ grade })
    .eq("id", profile.id);
  if (error) {
    console.error("[settings] grade:", error.message);
    return { error: "Couldn't save that. Try again.", values };
  }
  refresh();
  return { ok: "Saved.", values: { grade: grade ? String(grade) : "" } };
}

export async function updateName(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  const profile = await requireProfile();
  const parsed = z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(60, "Keep it under 60 characters.")
    .safeParse(form.get("full_name"));
  const values = { full_name: String(form.get("full_name") ?? "") };
  if (!parsed.success)
    return {
      fieldErrors: { full_name: parsed.error.issues[0].message },
      values,
    };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data })
    .eq("id", profile.id);
  if (error) {
    console.error("[settings] name:", error.message);
    return { error: "Couldn't save that. Try again.", values };
  }
  refresh();
  return { ok: "Saved.", values: { full_name: parsed.data } };
}

export async function setAdminPasscode(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  // The RPC checks too; this keeps a direct POST from a non-executive from reaching it at all.
  const profile = await requireProfile();
  if (profile.role !== "executive")
    return { error: "Only executives can set the passcode." };
  const code = String(form.get("new_passcode") ?? "");
  // Count characters the way Postgres char_length does (code points), not UTF-16 units.
  const length = [...code].length;
  if (length < 12)
    return { fieldErrors: { new_passcode: "Use at least 12 characters." } };
  if (length > 72)
    return { fieldErrors: { new_passcode: "Keep it under 72 characters." } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_passcode", { code });
  if (error) {
    if (error.code === "42501")
      return { error: "Only executives can set the passcode." };
    console.error("[settings] passcode:", error.message);
    return { error: "Couldn't save that. Try again." };
  }
  refresh();
  return { ok: "Passcode set. It works once: share it only with the next new admin." };
}

export async function changePassword(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  const profile = await requireProfile();
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!current)
    return { fieldErrors: { current: "Enter your current password." } };
  if (password.length < 8)
    return { fieldErrors: { password: "Use at least 8 characters." } };
  if (new TextEncoder().encode(password).length > 72) {
    return {
      fieldErrors: {
        password: "That's too long. Keep it under 72 characters.",
      },
    };
  }
  if (password !== confirm)
    return { fieldErrors: { confirm: "Passwords don't match." } };

  const supabase = await createClient();
  // Proves it's the account owner, not someone at an unlocked device or holding a stolen session.
  const check = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: current,
  });
  if (check.error) {
    if (check.error.message.toLowerCase().includes("rate limit"))
      return { error: "Too many tries. Wait a minute and try again." };
    return { fieldErrors: { current: "That isn't your current password." } };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.message.toLowerCase().includes("different from the old")) {
      return {
        fieldErrors: {
          password: "That's your current password. Pick a new one.",
        },
      };
    }
    console.error("[settings] password:", error.message);
    return { error: "Couldn't change it. Try again." };
  }
  // A new password should end any session someone else may be holding, and the phone notifications going to
  // those devices with it.
  await forgetOtherDevices(supabase, profile.id);
  await supabase.auth.signOut({ scope: "others" });
  return { ok: "Password changed." };
}
