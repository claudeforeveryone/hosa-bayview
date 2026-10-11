import Link from "next/link";
import { ClassicLogo } from "@/components/classic-logo";
import { SiteFooter } from "@/components/site-footer";
import { SiteJsonLd } from "@/components/site-json-ld";
import { ThemeToggle } from "@/components/theme-toggle";

// One centred reading column (38rem of text, about 70 characters a line) shared by the bar, the page and the footer,
// so the mark, the text and the toggle line up.
const column = "mx-auto w-full max-w-[42rem] px-4 sm:px-8";

// Terms and privacy. A navy band with the mark (the same field as the sign-in pages people come from), the reading
// column, the footer. No app navigation, so a guest and a member read the same page.
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
          <Link href="/" aria-label="HOSA Bayview home" className="block">
            <ClassicLogo className="h-[72px] sm:h-[96px]" />
          </Link>
          <ThemeToggle className="-mr-3 text-on-field-2 hover:text-on-field" />
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
