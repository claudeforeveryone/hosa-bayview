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

// Which platform's proxy put the caller's address in the headers. Only that proxy's own header is trusted, because a
// client can send any of these headers itself.
export type Edge = "vercel" | "cloudflare";

// The OpenNext Cloudflare build runs inside a Worker, where navigator.userAgent is "Cloudflare-Workers" (the
// global_navigator flag, on by default for any recent compatibility_date). Everything else, including next dev, is
// treated as Vercel, the host today.
export function currentEdge(): Edge {
  return typeof navigator !== "undefined" &&
    navigator?.userAgent === "Cloudflare-Workers"
    ? "cloudflare"
    : "vercel";
}

// The caller's IP for the per-IP limit. Vercel overwrites x-forwarded-for with the client's address (x-real-ip is
// the same), so its first entry is the client. Cloudflare appends to a client-supplied x-forwarded-for instead, so
// there only cf-connecting-ip counts. Empty when the trusted header is missing, and those callers share one bucket.
export function clientIp(headers: Headers, edge: Edge = currentEdge()): string {
  const ip =
    edge === "cloudflare"
      ? headers.get("cf-connecting-ip")
      : headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        headers.get("x-real-ip");
  return (ip?.trim() || "").slice(0, 100);
}
