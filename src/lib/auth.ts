import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sessionState } from "@/lib/session-state";
import { banStatus } from "@/lib/moderation";

export type Role = "executive" | "trainer" | "trainee";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
  avatar_path: string | null;
  grade: number | null;
  banned_until: string | null;
  ban_reason: string | null;
};

const PROFILE_COLUMNS =
  "id, email, full_name, role, created_at, avatar_path, grade, banned_until, ban_reason";

type Session =
  { signedIn: false } | { signedIn: true; profile: Profile | null };

// The signed-in user's id, or null. Once per request; lets lookups that only need the id start before the
// profile arrives.
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const result = await supabase.auth.getClaims();
  const state = sessionState(result);
  if (state === "unavailable") throw new Error("Auth server unreachable");
  const id = result.data?.claims?.sub;
  return state === "signed-out" || !id ? null : id;
});

// One session + profile lookup per request, shared by layout and page.
const getSession = cache(async (): Promise<Session> => {
  const id = await getUserId();
  if (!id) return { signedIn: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  // A failed lookup is an outage, not a missing account: surface it to the error boundary.
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return { signedIn: true, profile: (data as Profile | null) ?? null };
});

export async function getProfile(): Promise<Profile | null> {
  const session = await getSession();
  return session.signedIn ? session.profile : null;
}

export async function requireProfile(): Promise<Profile> {
  const session = await getSession();
  if (!session.signedIn) redirect("/login");
  // Signed in but no profile: clear the dead session instead of looping through /login.
  if (!session.profile) redirect("/auth/signout");
  // A banned account gets the banned page and nothing else in the app.
  if (banStatus(session.profile.banned_until, new Date()).banned)
    redirect("/banned");
  return session.profile;
}

export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/");
  return profile;
}

export const canTeach = (p: Pick<Profile, "role">) =>
  p.role === "trainer" || p.role === "executive";
