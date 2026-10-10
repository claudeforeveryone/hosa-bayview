"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { type Category, tabsFor } from "@/lib/classroom-tabs";

// Condensed caps tabs; the active one gets the maroon rule. Scrolls sideways on phones.
export function ClassroomTabs({
  id,
  canManage,
  category,
}: {
  id: string;
  canManage: boolean;
  category: Category | null;
}) {
  const path = usePathname();
  const base = `/c/${id}`;
  const tabs = tabsFor(category, canManage);
  const nav = useRef<HTMLElement>(null);

  // On phones the strip scrolls; keep the current tab on screen.
  useEffect(() => {
    const strip = nav.current;
    const tab = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !tab) return;
    const left = tab.offsetLeft - strip.offsetLeft;
    if (
      left < strip.scrollLeft ||
      left + tab.offsetWidth > strip.scrollLeft + strip.clientWidth
    ) {
      strip.scrollLeft = left - 16;
    }
  }, [path]);

  return (
    <nav
      ref={nav}
      aria-label="Event"
      className="-mx-4 overflow-x-auto [scrollbar-width:none] sm:mx-0 [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max min-w-full border-b border-rule px-4 sm:px-0">
        {tabs.map(({ slug, label }) => {
          const href = slug ? `${base}/${slug}` : base;
          const active = slug
            ? path === href || path.startsWith(`${href}/`)
            : path === base;
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`caps step -mb-px block border-b-[3px] px-2.5 py-3 text-[16px] sm:px-4 sm:text-[18px] ${
                  active
                    ? "border-you text-ink"
                    : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
