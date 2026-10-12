import type { Metadata } from "next";
import { BottomNav, MobileBar, Sidebar } from "@/components/nav";
import { LuckyBonus } from "@/components/lucky-bonus";
import { OnlineHeartbeat } from "@/components/online-heartbeat";
import { SiteFooter } from "@/components/site-footer";
import { PwaLayer } from "@/components/pwa/pwa-layer";
import { pushConfig } from "@/lib/push/config";
import { WarningBanner } from "@/components/warning-banner";
import { canTeach, getUserId, requireProfile } from "@/lib/auth";
import { APPLE_WEB_APP } from "@/lib/pwa/metadata";
import { getMyClassrooms } from "@/lib/classrooms";
import { canSeeDevStats } from "@/lib/dev-stats-data";
import { feedbackEnabled } from "@/lib/feedback-enabled";
import { createClient } from "@/lib/supabase/server";

// The oldest warning the member hasn't cleared. A failed lookup just means no banner this time.
async function unseenWarning(userId: string | null) {
  if (!userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_warnings")
    .select("id, message")
    .eq("user_id", userId)
    .is("seen_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as { id: string; message: string } | null) ?? null;
}

// Unread notifications for the bell. The bell re-checks on its own, so a failed lookup just starts at zero.
async function unreadCount() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_notifications");
  return typeof data === "number" ? data : 0;
}

// Home-screen settings for iPhone, as segment metadata so the root layout's own metadata is left alone.
export const metadata: Metadata = { appleWebApp: APPLE_WEB_APP };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The sidebar list is a convenience; a failed lookup shouldn't take every page down with it.
  // All three start together; the warning only needs the id, not the whole profile.
  const [profile, rooms, warning, unread, canSeeStats, canSendFeedback] =
    await Promise.all([
      requireProfile(),
      getMyClassrooms().catch(() => []),
      getUserId()
        .then(unseenWarning)
        .catch(() => null),
      unreadCount().catch(() => 0),
      // Only stats viewers get the Developer link; the stats page and RPC check the same thing in the database.
      canSeeDevStats().catch(() => false),
      // Send feedback is listed under More once its migration (0231) is on the database.
      feedbackEnabled().catch(() => false),
    ]);
  const nav = {
    isExec: profile.role === "executive",
    canSeeStats,
    canSendFeedback,
    canTeach: canTeach(profile),
    rooms: rooms.map(({ id, num, name }) => ({ id, num, name })),
    unread,
  };

  return (
    <div className="flex min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      <a
        href="#main"
        className="caps sr-only bg-ink px-4 py-2 text-ground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <Sidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        {warning ? (
          <WarningBanner
            key={warning.id}
            id={warning.id}
            message={warning.message}
          />
        ) : null}
        <MobileBar {...nav} />
        <main
          id="main"
          className="mx-auto w-full max-w-[80rem] flex-1 px-4 pt-6 pb-10 sm:px-8 lg:px-12 lg:pt-12"
        >
          {children}
        </main>
        {/* Terms, Privacy and the credit at the foot of every page, at every width. */}
        <div className="mx-auto w-full max-w-[80rem] px-4 sm:px-8 lg:px-12">
          <SiteFooter className="border-t border-rule pt-1 pb-4 text-ink-2 lg:pb-6" />
        </div>
      </div>
      <BottomNav
        isExec={nav.isExec}
        canSeeStats={nav.canSeeStats}
        canSendFeedback={nav.canSendFeedback}
        roomCount={nav.rooms.length}
      />
      <OnlineHeartbeat />
      <PwaLayer
        card
        signedIn
        pushKey={pushConfig()?.publicKey ?? null}
        userId={profile.id}
      />
      <LuckyBonus />
    </div>
  );
}
