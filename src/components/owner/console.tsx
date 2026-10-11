import Link from "next/link";
import type { ReactNode } from "react";
import { PageTitle } from "@/components/page-title";
import { TABS, TAB_LABEL, type OwnerTab } from "@/lib/owner-metrics";

// The owner console frame: the page title, the section rail, then the open section. `base` is /developer, or the
// dev-only gallery. The rail is a ruled grid, never a scrolling row, so every section and the filled "you are
// here" cell are on screen: four across in two rows up to the laptop breakpoint (each cell stays wide enough for
// ENGAGEMENT down to a 320px phone), then one column beside the section. Every tab uses the same rail, so switching
// sections never moves it; the Members table scrolls sideways inside its column instead.
export function OwnerConsole({
  base,
  tab,
  extra,
  children,
}: {
  base: string;
  tab: OwnerTab;
  // Kept on every section link (the gallery uses it to stay in fixture mode).
  extra?: Record<string, string>;
  children: ReactNode;
}) {
  const href = (t: OwnerTab) => {
    const search = new URLSearchParams(extra);
    if (t !== "overview") search.set("tab", t);
    const qs = search.toString();
    return qs ? `${base}?${qs}` : base;
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageTitle meta="Owner console. Only accounts on the stats list can open it.">
        Developer
      </PageTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <nav
          aria-label="Console sections"
          className="min-w-0 lg:sticky lg:top-6 lg:self-start"
        >
          <ul className="grid grid-cols-4 gap-px border-2 border-ink bg-ink lg:grid-cols-1">
            {TABS.map((t) => {
              const on = t === tab;
              return (
                <li key={t} className="min-w-0 bg-ground">
                  <Link
                    href={href(t)}
                    aria-current={on ? "page" : undefined}
                    className={`caps step flex h-full min-h-12 items-center justify-center px-0.5 text-center text-[clamp(12px,3.6vw,16px)] leading-tight lg:min-h-14 lg:justify-start lg:px-5 lg:text-left lg:text-[18px] ${
                      on ? "bg-ink text-ground" : "text-ink hover:bg-band"
                    }`}
                  >
                    {TAB_LABEL[t]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-12">
          {children}
        </div>
      </div>
    </div>
  );
}
