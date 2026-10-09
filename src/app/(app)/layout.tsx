import { BottomNav, MobileBar, Sidebar } from "@/components/nav";
import { Credit } from "@/components/credit";
import { canTeach, requireProfile } from "@/lib/auth";
import { getMyClassrooms } from "@/lib/classrooms";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The sidebar list is a convenience; a failed lookup shouldn't take every page down with it.
  const [profile, rooms] = await Promise.all([requireProfile(), getMyClassrooms().catch(() => [])]);
  const nav = {
    isExec: profile.role === "executive",
    canTeach: canTeach(profile),
    rooms: rooms.map(({ id, num, name }) => ({ id, num, name })),
  };

  return (
    <div className="flex min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      <a href="#main" className="caps sr-only bg-ink px-4 py-2 text-ground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50">
        Skip to content
      </a>
      <Sidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar {...nav} />
        <main id="main" className="mx-auto w-full max-w-[80rem] flex-1 px-4 pt-6 pb-10 sm:px-8 lg:px-12 lg:pt-12">
          {children}
        </main>
        <footer className="px-4 pb-4 sm:px-8 lg:hidden">
          <Credit className="text-ink-2/80" />
        </footer>
      </div>
      <BottomNav isExec={nav.isExec} />
    </div>
  );
}
