import { HeroBanner } from "@/components/hero-banner";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";

// Phone: a navy band just tall enough for the banner, the form straight under it. Desktop: navy field owns the left half.
// Landmarks: the navy band is the page's header (banner), the form column is a plain div so its footer is the page's
// contentinfo (a footer inside a section isn't), and the form is main. Every line, the hidden ones too, sits in one.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-none">
      <header className="relative flex flex-col justify-between bg-field px-4 py-6 text-on-field sm:px-8 lg:min-h-dvh lg:px-12 lg:pt-10 lg:pb-12">
        <HeroBanner bare className="my-auto pr-12 lg:pr-0" />
        <ThemeToggle className="absolute top-3 right-3 text-on-field sm:top-4 sm:right-4" />
      </header>
      <div className="flex flex-col px-4 pt-8 pb-6 sm:px-8 lg:justify-end lg:px-12 lg:pt-10 lg:pb-12">
        <main id="main" className="w-full max-w-[26rem]">
          {children}
        </main>
        <SiteFooter className="mt-auto pt-10 text-ink-2 lg:mt-10 lg:pt-0" />
      </div>
    </div>
  );
}
