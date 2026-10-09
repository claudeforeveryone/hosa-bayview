"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { AuthState } from "@/app/(auth)/actions";
import { requireProfile } from "@/lib/auth";
import { parseGrade } from "@/lib/profile";
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
  return { ok: "Passcode set. Share it only with new admins." };
}

export async function changePassword(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  await requireProfile();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
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
  // A new password should end any session someone else may be holding.
  await supabase.auth.signOut({ scope: "others" });
  return { ok: "Password changed." };
}
