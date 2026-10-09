import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Clears a session whose account has no profile (e.g. it was removed), then shows login.
// Sessions with a profile are left alone, so a cross-site link can't log anyone out,
// and a failed lookup never signs anyone out.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return NextResponse.redirect(new URL("/login", origin));

  const { data: profile, error } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
  if (error || profile) return NextResponse.redirect(new URL("/", origin));

  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login?account=missing", origin));
}
