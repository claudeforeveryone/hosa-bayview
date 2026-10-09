import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Password reset links that work from any browser (the Gmail app, a different phone). The email template sends
// `token_hash` here instead of a PKCE code, which only works in the browser that asked for the reset.
// Only recovery links are accepted, and they always land on the new-password form, which names the account.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  let ok = false;
  if (tokenHash && type === "recovery") {
    const supabase = await createClient();
    ok = !(await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash })).error;
  }

  return NextResponse.redirect(new URL(ok ? "/reset-password" : "/login?link=expired", url.origin));
}
