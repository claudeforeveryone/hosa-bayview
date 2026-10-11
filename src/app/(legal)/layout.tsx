import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClassicLogo } from "@/components/classic-logo";
import { SiteFooter } from "@/components/site-footer";
import { SiteJsonLd } from "@/components/site-json-ld";
import { ThemeToggle } from "@/components/theme-toggle";

// One centred reading column (38rem of text, about 70 characters a line) shared by the bar, the page and the footer,
// so the mark, the text and the toggle line up.
const column = "mx-auto w-full max-w-[42rem] px-4 sm:px-8";

// Terms and privacy. A navy band with the mark (the same field as the sign-in pages people come from) and a way back
// to the app, the reading column, the footer. No app navigation, so a guest and a member read the same page.
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="caps sr-only bg-ink px-4 py-2 text-ground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <header className="bg-field text-on-field">
        <div
          className={`${column} flex items-center justify-between gap-4 py-3 sm:py-4`}
        >
          {/* Named by the logo itself ("HOSA Bayview 2026–2027"), so the visible season is part of the link's name. */}
          <Link href="/" className="block">
            <ClassicLogo className="h-[72px] sm:h-[96px]" />
          </Link>
          {/* Members reach these pages from the app's footer, and the installed app has no browser back button, so
              the way back is spelled out. A guest who follows it lands on sign-in. */}
          <div className="flex items-center gap-1 sm:gap-3">
            <Link
              href="/"
              className="caps inline-flex min-h-11 items-center gap-1.5 text-[15px] text-on-field-2 hover:text-on-field hover:underline hover:underline-offset-4"
            >
              <ArrowLeft size={18} strokeWidth={2} aria-hidden />
              Back to the app
            </Link>
            <ThemeToggle className="-mr-3 text-on-field-2 hover:text-on-field" />
          </div>
        </div>
      </header>
      <main id="main" className={`${column} flex-1 pt-8 pb-14 sm:pt-12`}>
        {children}
      </main>
      <div className={column}>
        <SiteFooter className="border-t border-rule pt-2 pb-6 text-ink-2" />
      </div>
      <SiteJsonLd />
    </div>
  );
}
