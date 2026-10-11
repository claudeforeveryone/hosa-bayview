import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { pushConfig } from "@/lib/push/config";
import { drainOutbox } from "@/lib/push/deliver";
import { supabaseOutbox } from "@/lib/push/outbox";
import { makeSender } from "@/lib/push/sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The drain starts no new claim or wave of pushes after 40 s, and no push runs past 12 s, so it reports by ~52 s.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Poked by the database (pg_net, after each notification insert and by the every-minute sweep), never by a
// browser. Public in the proxy because the database has no session; the shared secret is the whole gate, so it is
// checked before anything else runs. The body is ignored: the queue says what to send.
export async function POST(request: Request) {
  const cfg = pushConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Push is not set up" },
      { status: 503, headers: NO_STORE },
    );
  }
  if (
    !secretMatches(
      request.headers.get("x-push-secret") ?? "",
      cfg.internalSecret,
    )
  ) {
    return NextResponse.json(
      { error: "Not allowed" },
      { status: 401, headers: NO_STORE },
    );
  }
  try {
    const result = await drainOutbox(
      supabaseOutbox(cfg.internalSecret),
      makeSender(cfg),
    );
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    console.error(
      "[push:deliver]",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json(
      { error: "Delivery failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
