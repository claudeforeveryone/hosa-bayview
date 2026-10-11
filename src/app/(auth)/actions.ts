"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNext } from "@/lib/safe-next";
import { parseGrade } from "@/lib/profile";
import { SHORT_SESSION } from "@/lib/session-length";
import { forgetOtherDevices, forgetThisDevice } from "@/lib/push/forget";
import {
  WRONG_CHAPTER_CODE,
  CHAPTER_CODE_SLOW,
  clientIp,
  readChapterGate,
} from "@/lib/chapter-code";

export type AuthState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: string;
  values?: Record<string, string>;
  // Sign-up only: a chapter code is required, so the form shows its field even if the page loaded before the
  // gate was turned on.
  chapterGate?: boolean;
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

// "Stay signed in" off: a browser-session marker, so the auth cookies written next carry no expiry. Not
// httpOnly: the browser client reads it too when it refreshes the session. Applied only right before signing
// in, so a typo'd attempt leaves the current session alone.
async function rememberChoice(form: FormData) {
  const store = await cookies();
  if (form.get("remember") === "on") store.delete(SHORT_SESSION);
  else
    store.set(SHORT_SESSION, "1", {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const identifier = String(form.get("email") ?? "").trim();
  const values = {
    email: identifier,
    remember: form.get("remember") === "on" ? "on" : "off",
  };
  // The old shared admin usernames (like "KadenLi") are gone; everyone signs in with their own email now.
  if (identifier && !identifier.includes("@"))
    return {
      fieldErrors: {
        email:
          "Usernames don't work anymore. Log in with the email you signed up with. Admins keep admin on that account.",
      },
      values,
    };
  const parsed = z
    .object({ email, password: z.string().min(1, "Enter your password.") })
    .safeParse({
      email: identifier,
      password: form.get("password"),
    });
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  await rememberChoice(form);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendly(error.message), values };

  redirect(safeNext(form.get("next")));
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
  // The chapter code is never echoed back, like the passwords.
  const values = {
    full_name: String(form.get("full_name") ?? ""),
    email: String(form.get("email") ?? ""),
    grade: String(form.get("grade") ?? ""),
  };
  // Grade is optional; anything other than 9 to 12 is simply no grade.
  const grade = parseGrade(form.get("grade"));
  const code = String(form.get("chapter_code") ?? "").trim();

  const supabase = await createClient();
  // Null: migration 0090 isn't applied yet, so there's no gate.
  let gate: boolean | null;
  try {
    gate = await readChapterGate(supabase);
  } catch (e) {
    console.error("[auth]", (e as Error).message);
    return { error: "Something went wrong. Try again.", values };
  }
  const chapterGate = gate === true ? { chapterGate: true } : {};
  const wrongCode: AuthState = {
    fieldErrors: { chapter_code: WRONG_CHAPTER_CODE },
    values,
    chapterGate: true,
  };

  if (!parsed.success || (gate && !code))
    return {
      fieldErrors: {
        ...(parsed.success ? {} : fieldErrors(parsed.error)),
        ...(gate && !code ? { chapter_code: "Enter the chapter code." } : {}),
      },
      values,
      ...chapterGate,
    };

  // The code is checked (and rate limited per IP, plus a cap for everyone) in the database, which hands back a
  // single-use ticket. The account insert redeems it, so the auth API can't be used to skip this step. Only the
  // server may test a code, so the IP passed is the one Vercel saw.
  let ticket: string | null = null;
  if (gate) {
    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch (e) {
      console.error("[auth]", (e as Error).message);
      return {
        error: "Something went wrong. Try again.",
        values,
        ...chapterGate,
      };
    }
    const check = await admin.rpc("check_chapter_code", {
      code,
      ip: clientIp(await headers()),
    });
    if (check.error?.code === "54000")
      return {
        fieldErrors: { chapter_code: CHAPTER_CODE_SLOW },
        values,
        chapterGate: true,
      };
    if (check.error) {
      console.error("[auth] check_chapter_code:", check.error.message);
      return {
        error: "Something went wrong. Try again.",
        values,
        ...chapterGate,
      };
    }
    if (typeof check.data !== "string" || !check.data) return wrongCode;
    ticket = check.data;
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.full_name,
        ...(grade ? { grade: String(grade) } : {}),
        ...(ticket ? { chapter_ticket: ticket } : {}),
      },
      emailRedirectTo: `${await origin()}/auth/callback`,
    },
  });
  if (error) {
    // The trigger refused the ticket (it expired, or the code changed in between). The auth server reports any
    // trigger failure this way.
    if (
      ticket &&
      error.message.toLowerCase().includes("database error saving new user")
    )
      return wrongCode;
    return { error: friendly(error.message), values, ...chapterGate };
  }
  if (!data.session)
    return {
      ok: form.get("passcode")
        ? "Check your email to confirm your account, then log in and enter the admin passcode in Settings."
        : "Check your email to confirm your account, then log in.",
      values,
    };

  // Optional admin passcode. The account exists either way; a miss goes to Settings to try again.
  const passcode = String(form.get("passcode") ?? "");
  if (passcode) {
    const claim = await supabase.rpc("claim_admin", { code: passcode });
    if (claim.error) {
      if (claim.error.code !== "54000")
        console.error("[auth] claim_admin on signup:", claim.error.message);
      redirect(
        `/settings?passcode=${claim.error.code === "54000" ? "slow" : "retry"}#admin-h`,
      );
    }
    redirect(claim.data ? "/admin" : "/settings?passcode=wrong#admin-h");
  }

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
  // A new password should end any session someone else may be holding, and the phone notifications going to
  // those devices with it.
  // The password is already changed, so a failed lookup here only skips the push cleanup.
  const { data: claims } = await supabase.auth
    .getClaims()
    .catch(() => ({ data: null }));
  const uid = claims?.claims?.sub;
  if (typeof uid === "string") await forgetOtherDevices(supabase, uid);
  await supabase.auth.signOut({ scope: "others" });

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  // This browser's phone notifications stop with its session (while RLS still knows whose row it is).
  await forgetThisDevice(supabase);
  // This device only; other devices stay signed in.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
