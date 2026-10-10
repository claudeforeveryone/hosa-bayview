import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Supabase free projects pause after 7 days idle. A daily Vercel Cron hits this to reach Postgres once.
export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  // timingSafeEqual needs equal lengths; the length of the secret is not a secret worth hiding here.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // A HEAD count returns no rows. Even a permission error (RLS or revoked grant) proves Postgres answered.
    const { error, status } = await supabase.from("profiles").select("id", { count: "exact", head: true });
    if (error && error.code !== "42501" && status !== 401 && status !== 403) {
      return new Response(null, { status: 502 });
    }
  } catch {
    return new Response(null, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
