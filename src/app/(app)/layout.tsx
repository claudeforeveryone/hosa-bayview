import Link from "next/link";
import { Logo } from "@/components/logo";
import { BottomNav, TopNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Credit } from "@/components/credit";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  const isExec = profile.role === "executive";

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      <a href="#main" className="caps sr-only bg-ink px-4 py-2 text-ground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50">
        Skip to content
      </a>
      <header className="mx-auto flex w-full max-w-[90rem] items-start justify-between gap-4 px-4 pt-3 sm:px-8 lg:items-end lg:pt-6">
        <Link href="/" aria-label="HOSA Bayview home" className="text-ink">
          <Logo className="h-[104px] lg:h-[150px]" />
        </Link>
        <div className="flex items-center gap-2">
          <TopNav isExec={isExec} />
          <ThemeToggle className="text-ink" />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[90rem] flex-1 px-4 pt-6 pb-10 sm:px-8 lg:pt-10">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-[90rem] px-4 pb-4 sm:px-8">
        <Credit />
      </footer>
      <BottomNav isExec={isExec} />
    </div>
  );
}
