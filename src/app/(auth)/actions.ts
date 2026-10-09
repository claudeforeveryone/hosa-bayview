"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { parseGrade } from "@/lib/profile";
import { usernameKey } from "@/lib/username";

export type AuthState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: string;
  values?: Record<string, string>;
};

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a real email address.");
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "That's too long. Keep it under 72 characters.",
  );

function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login"))
    return "That email and password don't match.";
  if (m.includes("already registered"))
    return "There's already an account with that email. Try logging in.";
  if (m.includes("banned")) return "This account is banned.";
  if (m.includes("rate limit"))
    return "Too many tries. Wait a minute and try again.";
  if (m.includes("email not confirmed"))
    return "Confirm your email first, then log in.";
  if (m.includes("email address") && m.includes("invalid"))
    return "That email address isn't accepted. Use your real email.";
  if (m.includes("sending") && m.includes("email"))
    return "We couldn't send the email. Try again in a few minutes.";
  console.error("[auth]", message);
  return "Something went wrong. Try again.";
}

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues)
    out[String(issue.path[0])] ??= issue.message;
  return out;
}

// Links in auth emails point at the configured site; the request origin is only a fallback.
async function origin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const header = (await headers()).get("origin");
  if (header && /^https?:\/\/[^/]+$/.test(header)) return header;
  return "http://localhost:3000";
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const identifier = String(form.get("email") ?? "").trim();
  const values = { email: identifier };
  if (!identifier.includes("@"))
    return usernameLogin(
      identifier,
      String(form.get("password") ?? ""),
      values,
    );

  const parsed = z
    .object({ email, password: z.string().min(1, "Enter your password.") })
    .safeParse({
      email: identifier,
      password: form.get("password"),
    });
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendly(error.message), values };

  redirect(safeNext(form.get("next")));
}

// Executive usernames (the demo admins). Their password is the executive password, checked in the
// database (demo_credentials); works only while an exec has demo sign-in switched on.
async function usernameLogin(
  username: string,
  password: string,
  values: Record<string, string>,
): Promise<AuthState> {
  const errors: Record<string, string> = {};
  if (!username) errors.email = "Enter your email or username.";
  if (!password) errors.password = "Enter your password.";
  if (Object.keys(errors).length) return { fieldErrors: errors, values };

  const wrong = { error: "That username and password don't match.", values };
  const supabase = await createClient();
  const { data: people } = await supabase.rpc("demo_logins");
  const key = usernameKey(username);
  const match = ((people ?? []) as { slug: string; full_name: string }[]).find(
    (p) => usernameKey(p.slug) === key || usernameKey(p.full_name) === key,
  );
  if (!match) return wrong;

  const { data, error } = await supabase
    .rpc("demo_credentials", { p_slug: match.slug, p_password: password })
    .maybeSingle<{ email: string; secret: string }>();
  if (error) {
    if (error.code === "54000")
      return {
        error: "Too many wrong passwords. Try again in 10 minutes.",
        values,
      };
    console.error("[auth] username login:", error.message);
    return { error: "Something went wrong. Try again.", values };
  }
  if (!data) return wrong;
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.secret,
  });
  if (signInError) return { error: friendly(signInError.message), values };
  redirect("/");
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z
    .object({
      full_name: z
        .string()
        .trim()
        .min(2, "Enter your name.")
        .max(60, "Keep it under 60 characters."),
      email,
      password,
    })
    .safeParse({
      full_name: form.get("full_name"),
      email: form.get("email"),
      password: form.get("password"),
    });
  const values = {
    full_name: String(form.get("full_name") ?? ""),
    email: String(form.get("email") ?? ""),
    grade: String(form.get("grade") ?? ""),
  };
  // Grade is optional; anything other than 9 to 12 is simply no grade.
  const grade = parseGrade(form.get("grade"));
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.full_name,
        ...(grade ? { grade: String(grade) } : {}),
      },
      emailRedirectTo: `${await origin()}/auth/callback`,
    },
  });
  if (error) return { error: friendly(error.message), values };
  if (!data.session)
    return {
      ok: "Check your email to confirm your account, then log in.",
      values,
    };

  redirect("/");
}

export async function claimAdmin(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  const code = String(form.get("passcode") ?? "");
  if (!code) return { fieldErrors: { passcode: "Enter the passcode." } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_admin", { code });
  if (error) {
    if (error.code === "54000")
      return {
        fieldErrors: {
          passcode: "Too many wrong passcodes. Try again in 10 minutes.",
        },
      };
    console.error("[auth] claim_admin:", error.message);
    return { error: "Something went wrong. Try again." };
  }
  if (!data) return { fieldErrors: { passcode: "That passcode isn't right." } };
  redirect("/admin");
}

export async function requestReset(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  const parsed = z.object({ email }).safeParse({ email: form.get("email") });
  const values = { email: String(form.get("email") ?? "") };
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${await origin()}/auth/callback?next=/reset-password`,
    },
  );
  if (error) {
    if (error.message.toLowerCase().includes("rate limit"))
      return { error: friendly(error.message), values };
    // Misconfigured mail or redirect URLs would otherwise fail silently.
    console.error("[auth] password reset email failed:", error.message);
  }

  // Same answer whether or not the account exists.
  return {
    ok: "If that email has an account, a reset link is on its way. Check spam too.",
    values,
  };
}

export async function updatePassword(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, {
      message: "Passwords don't match.",
      path: ["confirm"],
    })
    .safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: friendly(error.message) };
  // A new password should end any session someone else may be holding.
  await supabase.auth.signOut({ scope: "others" });

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  // This device only; other devices stay signed in.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
