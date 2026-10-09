import { Logo } from "@/components/logo";
import { Credit } from "@/components/credit";
import { ThemeToggle } from "@/components/theme-toggle";

// Phone: navy band with the logo, form below. Desktop: navy field owns the left half.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="relative flex flex-col justify-between bg-field px-4 pt-4 pb-6 text-on-field sm:px-8 lg:min-h-dvh lg:px-12 lg:pt-10 lg:pb-12">
        <Logo className="h-32 self-start sm:h-40 lg:h-[clamp(12rem,26vw,20rem)]" />
        <ThemeToggle className="absolute top-3 right-3 text-on-field sm:top-4 sm:right-4" />
      </section>
      <section className="flex flex-col justify-end px-4 pt-10 pb-6 sm:px-8 lg:px-12 lg:pb-12">
        <div className="w-full max-w-[26rem]">{children}</div>
        <Credit className="mt-12 text-ink-2/80" />
      </section>
    </div>
  );
}
