import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";

// Shared by the push routes a member's own browser calls (/api/push/subscribe and /api/push/test).

export const NO_STORE = { "Cache-Control": "no-store" };

export function refuse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

// Only this site's own pages (and its service worker) call these. A JSON body already needs a CORS preflight from
// another site; this says no outright as well.
export function fromThisSite(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}

// The proxy already sends a signed-out browser to /login; this answers in JSON instead, in case a session ends
// mid-request, so the Settings switch shows the truth. Returns a response to send, or null to carry on.
export async function requireMember(): Promise<NextResponse | null> {
  try {
    if (await getUserId()) return null;
    return refuse("Sign in again to change notifications.", 401);
  } catch {
    return refuse("Can't reach the sign-in server. Try again in a minute.", 503);
  }
}
