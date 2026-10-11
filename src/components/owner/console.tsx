import Link from "next/link";
import type { ReactNode } from "react";
import { PageTitle } from "@/components/page-title";
import { TABS, TAB_LABEL, type OwnerTab } from "@/lib/owner-metrics";

// The owner console frame: the page title, then the same section rail Settings uses (a column on wide screens,
// one sideways-scrolling row on phones), then the open section. `base` is /developer, or the dev-only gallery.
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
      <PageTitle meta="Owner console. Only you can open this page.">
        Developer
      </PageTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <nav
          aria-label="Console sections"
          className="min-w-0 lg:sticky lg:top-6 lg:self-start"
        >
          <ul className="flex overflow-x-auto border-2 border-ink lg:flex-col lg:overflow-visible">
            {TABS.map((t) => {
              const on = t === tab;
              return (
                <li
                  key={t}
                  className="shrink-0 border-r border-ink last:border-r-0 lg:border-r-0 lg:border-b lg:last:border-b-0"
                >
                  <Link
                    href={href(t)}
                    aria-current={on ? "page" : undefined}
                    className={`caps step flex min-h-12 items-center px-3 text-[15px] sm:px-5 sm:text-[18px] lg:min-h-14 ${
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
