import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ClaimRow, Outbox, Report } from "./deliver";

// The database side of delivery (migration 0221). Called with the publishable key and no session: push_claim and
// push_report refuse anyone without the shared secret, so this route never needs the service key.
export function supabaseOutbox(secret: string): Outbox {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return {
    async claim(limit: number): Promise<ClaimRow[]> {
      const { data, error } = await db.rpc("push_claim", {
        p_secret: secret,
        p_limit: limit,
      });
      if (error)
        throw new Error(`push_claim failed: ${error.code} ${error.message}`);
      return (data ?? []) as ClaimRow[];
    },
    async report(r: Report): Promise<void> {
      const { error } = await db.rpc("push_report", {
        p_secret: secret,
        p_done: r.done,
        p_ok: r.ok,
        p_failed: r.failed,
        p_gone: r.gone,
      });
      if (error)
        throw new Error(`push_report failed: ${error.code} ${error.message}`);
    },
  };
}
