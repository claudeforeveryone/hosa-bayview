import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_BUCKET } from "@/lib/avatar";
import { createAdminClient } from "@/lib/supabase/admin";

// Supabase free projects pause after 7 days idle. A daily Vercel Cron hits this to reach Postgres once, then runs the
// housekeeping the privacy policy promises (wrong-code logs and deleted accounts' pictures go within a day).
export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  // timingSafeEqual needs equal lengths; the length of the secret is not a secret worth hiding here.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// A file directly inside a member's folder: "<lower-case uuid>/<name>". The database decides which folders belong to
// deleted accounts; this only refuses anything shaped differently.
const MEMBER_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?!\.\.?$)[^/]+$/;
// The chapter is small. More deleted accounts than this in one day means something is wrong (a restore or move that
// left auth users behind, say), so the sweep stops and waits for a person instead of erasing pictures.
const MAX_SWEEP = 20;

// Housekeeping the privacy policy relies on, run after the keep-alive. Each step runs even when another fails, and
// returns what went wrong, so a broken promise shows up as a failed cron run with a log line, never silently.
async function housekeeping(supabase: SupabaseClient): Promise<string[]> {
  const problems: string[] = [];
  // Wrong join and sign-up code logs older than a day (0250). Anon may run it: it only removes rows past retention.
  try {
    const { error } = await supabase.rpc("purge_attempt_logs");
    if (error) problems.push(`purge_attempt_logs: ${error.code ?? ""} ${error.message ?? ""}`.trim());
  } catch (e) {
    problems.push(`purge_attempt_logs: ${(e as Error).message}`);
  }
  // Picture files of deleted accounts (0251). Deleting an account deletes its profile row, but the file stays in the
  // avatars bucket, and storage files can only be erased through the Storage API, so this uses the secret key.
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("orphan_avatar_files");
    if (error) {
      problems.push(`orphan_avatar_files: ${error.code ?? ""} ${error.message ?? ""}`.trim());
    } else {
      const paths = (data ?? []) as string[];
      if (paths.length > MAX_SWEEP) {
        problems.push(`avatar sweep: ${paths.length} orphaned files at once (limit ${MAX_SWEEP}); removed none, check by hand`);
      } else if (!paths.every((path) => MEMBER_FILE.test(path))) {
        problems.push("avatar sweep: a path outside a member's folder; removed none, check by hand");
      } else if (paths.length) {
        const removed = await admin.storage.from(AVATAR_BUCKET).remove(paths);
        if (removed.error) problems.push(`avatar removal: ${removed.error.message}`);
      }
    }
  } catch (e) {
    problems.push(`avatar sweep: ${(e as Error).message}`);
  }
  return problems;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });

  let supabase: SupabaseClient;
  try {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // A no-argument RPC (migration 0084) runs a real query and returns nothing. Any error means no activity counted.
    const { error } = await supabase.rpc("keepalive");
    if (error) return new Response(null, { status: 502 });
  } catch {
    return new Response(null, { status: 502 });
  }

  const problems = await housekeeping(supabase);
  if (problems.length) {
    console.error(`[keepalive] housekeeping failed: ${problems.join("; ")}`);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
