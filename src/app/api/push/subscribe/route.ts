import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { subscribeSchema, unsubscribeSchema } from "@/lib/push/subscription";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function refuse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

// Only this site's own pages (and its service worker) call these. A JSON body already needs a CORS preflight from
// another site; this says no outright as well.
function fromThisSite(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}

// The proxy already sends a signed-out browser to /login; this answers in JSON instead of HTML if a session ends
// mid-request, so the Settings switch shows the truth.
async function signedIn(): Promise<NextResponse | null> {
  try {
    if (await getUserId()) return null;
    return refuse("Sign in again to change notifications.", 401);
  } catch {
    return refuse(
      "Can't reach the sign-in server. Try again in a minute.",
      503,
    );
  }
}

// Save this browser's push subscription for the signed-in member. The RPC repeats the checks and does the write
// as the database owner, so a device that belonged to someone else on this phone moves over.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return refuse("Not allowed", 403);
  const gate = await signedIn();
  if (gate) return gate;
  const parsed = subscribeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return refuse(parsed.error.issues[0]?.message ?? "Bad subscription", 400);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("push_subscribe", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_sound: parsed.data.sound ?? true,
  });
  if (error) {
    if (error.code === "42501")
      return refuse("Sign in again to change notifications.", 401);
    if (error.code === "22023" || error.code === "53400")
      return refuse(error.message, 400);
    if (error.code === "23514") return refuse("Bad subscription", 400);
    console.error("[push:subscribe]", error.code, error.message);
    return refuse("Could not save this device. Try again.", 500);
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

// Turn this device off. RLS limits the delete to the member's own rows.
export async function DELETE(request: Request) {
  if (!fromThisSite(request)) return refuse("Not allowed", 403);
  const gate = await signedIn();
  if (gate) return gate;
  const parsed = unsubscribeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return refuse("Bad request", 400);
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint);
  if (error) {
    console.error("[push:unsubscribe]", error.code, error.message);
    return refuse("Could not turn this device off. Try again.", 500);
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
