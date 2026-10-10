// Chapter code (migration 0090): while an executive has set one, sign-up needs it. The database enforces it on
// account creation; these helpers are the app side. Until 0090 is applied the RPCs don't exist, and every read
// here treats that as "no gate" so sign-up keeps working and the Admin section stays hidden.

export const WRONG_CHAPTER_CODE = "Wrong chapter code";
export const CHAPTER_CODE_SLOW = "Too many tries. Wait 10 minutes.";
export const CHAPTER_CODE_MIN = 6;
export const CHAPTER_CODE_MAX = 72;

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

// PostgREST says PGRST202 for a function it doesn't know; Postgres says 42883.
export const rpcMissing = (code: string | undefined) =>
  code === "PGRST202" || code === "42883";

// True or false once 0090 is applied, null before. Any other failure throws.
export async function readChapterGate(
  supabase: RpcClient,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("chapter_gate_active");
  if (!error) return data === true;
  if (rpcMissing(error.code)) return null;
  throw new Error(`Chapter code lookup failed: ${error.message}`);
}

// The caller's IP for the per-IP limit. On Vercel the first x-forwarded-for entry is the client (Vercel sets the
// header itself); x-real-ip is the fallback. Empty when neither is there, and those callers share one bucket.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headers.get("x-real-ip")?.trim() || "").slice(0, 100);
}
