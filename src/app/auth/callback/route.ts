import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

// Handles links from Supabase emails (password reset). Only the PKCE `code` flow is accepted:
// its verifier cookie ties the link to the browser that asked for it, so someone else's
// link can't sign this browser into their account.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");

  let ok = false;
  if (code) {
    const supabase = await createClient();
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  return NextResponse.redirect(new URL(ok ? next : "/login?link=expired", url.origin));
}
