import { NextResponse } from "next/server";
import { pushConfig } from "@/lib/push/config";
import { fromThisSite, NO_STORE, refuse, requireMember } from "@/lib/push/route-guards";
import { makeSender } from "@/lib/push/sender";
import { subscribeSchema } from "@/lib/push/subscription";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Settings > Phone app > Send a test. One push to this device, through the real push service, so a member can
// see delivery work end to end. The browser sends its own subscription (its keys never leave the server
// otherwise); the endpoint must already be saved for this member, which RLS checks.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return refuse("Not allowed", 403);
  const gate = await requireMember();
  if (gate) return gate;
  const cfg = pushConfig();
  if (!cfg) return refuse("Phone notifications aren't switched on for the site yet.", 503);
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refuse(parsed.error.issues[0]?.message ?? "Bad subscription", 400);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, sound")
    .eq("endpoint", parsed.data.endpoint)
    .maybeSingle();
  if (error) {
    console.error("[push:test]", error.code, error.message);
    return refuse("The test didn't go out. Try again.", 500);
  }
  if (!data) return refuse("This device isn't on yet. Turn notifications on first.", 404);

  const outcome = await makeSender(cfg)(
    {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    {
      title: "Notifications work",
      body: "This is how HOSA will reach you: announcements, tests, events and more.",
      url: "/settings?tab=notifications",
      tag: "hosa-test",
      kind: "test",
      // The same rule as real pushes (deliver.ts): only an explicit "off" on the Sound tab mutes it.
      silent: (data as { sound?: unknown }).sound === false,
    },
  );
  if (outcome.ok) return new NextResponse(null, { status: 204, headers: NO_STORE });
  if (outcome.gone) {
    return refuse("This device's subscription has expired. Switch notifications off and on again.", 410);
  }
  return refuse("The push service didn't take it. Try again in a minute.", 502);
}
