import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_BUCKET } from "@/lib/avatar";
import { createAdminClient } from "@/lib/supabase/admin";

// Supabase free projects pause after 7 days idle. A daily Vercel Cron hits this to reach Postgres once, then runs the
// housekeeping the privacy policy promises (wrong-code logs and deleted accounts' pictures go within two days).
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
// The sweep is for the odd deleted account. When more than 3 accounts' pictures, or more than a quarter of all the
// pictures in the bucket, look orphaned at once, something else is wrong (a restore or a move that left the auth users
// behind, say), so the sweep stops and waits for a person instead of erasing pictures. The share is what catches that
// case in a small bucket: there, every picture is only a few files.
const MAX_ACCOUNTS = 3;

type Sweep = { orphans: string[]; files: number };

// orphan_avatar_files() (0251) answers the orphaned paths and the bucket's total file count. Anything else is refused.
function asSweep(data: unknown): Sweep | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { orphans, files } = data as Record<string, unknown>;
  if (!Array.isArray(orphans) || !orphans.every((p) => typeof p === "string")) return null;
  if (typeof files !== "number" || !Number.isInteger(files) || files < 0) return null;
  return { orphans, files };
}

// Why the sweep must not run, or null when it may.
function sweepRefusal({ orphans, files }: Sweep): string | null {
  if (!orphans.every((path) => MEMBER_FILE.test(path))) return "a path outside a member's folder";
  const accounts = new Set(orphans.map((path) => path.split("/")[0])).size;
  if (accounts > MAX_ACCOUNTS || orphans.length * 4 > files) {
    return `${orphans.length} of ${files} pictures, from ${accounts} accounts, look orphaned (limit ${MAX_ACCOUNTS} accounts and a quarter of the pictures)`;
  }
  return null;
}

// Housekeeping the privacy policy relies on, run after the keep-alive. Each step runs even when another fails, and
// returns what went wrong, so a broken promise shows up as a failed cron run with a log line, never silently.
async function housekeeping(supabase: SupabaseClient): Promise<string[]> {
  const problems: string[] = [];
  // Wrong join and sign-up code logs older than 22 hours (0250). Anon may run it: it only removes rows past retention.
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
    const sweep = error ? null : asSweep(data);
    const refusal = sweep && sweepRefusal(sweep);
    if (error) {
      problems.push(`orphan_avatar_files: ${error.code ?? ""} ${error.message ?? ""}`.trim());
    } else if (!sweep) {
      problems.push("avatar sweep: orphan_avatar_files answered in an unexpected shape (is 0251 the current version?); removed none");
    } else if (refusal) {
      problems.push(`avatar sweep: ${refusal}; removed none, check by hand`);
    } else if (sweep.orphans.length) {
      const removed = await admin.storage.from(AVATAR_BUCKET).remove(sweep.orphans);
      if (removed.error) problems.push(`avatar removal: ${removed.error.message}`);
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
