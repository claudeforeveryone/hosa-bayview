import { HeroBanner } from "@/components/hero-banner";
import { Credit } from "@/components/credit";
import { ThemeToggle } from "@/components/theme-toggle";

// Phone: a navy band just tall enough for the banner, the form straight under it. Desktop: navy field owns the left half.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-none">
      <section className="relative flex flex-col justify-between bg-field px-4 py-6 text-on-field sm:px-8 lg:min-h-dvh lg:px-12 lg:pt-10 lg:pb-12">
        <HeroBanner bare className="my-auto pr-12 lg:pr-0" />
        <ThemeToggle className="absolute top-3 right-3 text-on-field sm:top-4 sm:right-4" />
      </section>
      <section className="flex flex-col px-4 pt-8 pb-6 sm:px-8 lg:justify-end lg:px-12 lg:pt-10 lg:pb-12">
        <div className="w-full max-w-[26rem]">{children}</div>
        <Credit className="mt-auto pt-12 text-ink-2/80 lg:mt-12 lg:pt-0" />
      </section>
    </div>
  );
}
