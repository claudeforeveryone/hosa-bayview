import { BottomNav, MobileBar, Sidebar } from "@/components/nav";
import { Credit } from "@/components/credit";
import { LuckyBonus } from "@/components/lucky-bonus";
import { OnlineHeartbeat } from "@/components/online-heartbeat";
import { WarningBanner } from "@/components/warning-banner";
import { canTeach, getUserId, requireProfile } from "@/lib/auth";
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
        <footer className="px-4 pb-4 sm:px-8 lg:hidden">
          <Credit className="text-ink-2/80" />
        </footer>
      </div>
      <BottomNav
        isExec={nav.isExec}
        canSeeStats={nav.canSeeStats}
        canSendFeedback={nav.canSendFeedback}
      />
      <OnlineHeartbeat />
      <LuckyBonus />
    </div>
  );
}
