import { isAuthRetryableFetchError } from "@supabase/supabase-js";

export type SessionState = "signed-in" | "signed-out" | "unavailable";

// Turns a getClaims() result into a decision. Network/5xx failures mean the auth server is
// unreachable, which must not look like being signed out. Any other auth error (bad or expired
// refresh token) really does mean signed out.
export function sessionState(result: { data: { claims?: { sub?: string } } | null; error: unknown }): SessionState {
  if (result.data?.claims?.sub) return "signed-in";
  if (result.error && isAuthRetryableFetchError(result.error)) return "unavailable";
  return "signed-out";
}
