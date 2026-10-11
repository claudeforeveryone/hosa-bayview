"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Category, tabsFor } from "@/lib/classroom-tabs";

// Condensed caps tabs; one maroon rule slides under the active tab. Scrolls sideways on phones.
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
  const strip = useRef<HTMLDivElement>(null);
  // Where the sliding rule sits: the active tab's left edge and width, measured before paint.
  const [rule, setRule] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const tab = strip.current?.querySelector<HTMLElement>(
        '[aria-current="page"]',
      );
      setRule(tab ? { x: tab.offsetLeft, w: tab.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [path]);

  // On phones the strip scrolls; keep the current tab on screen.
  useEffect(() => {
    const scroller = nav.current;
    const tab = strip.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (!scroller || !tab) return;
    const left = tab.offsetLeft;
    if (
      left < scroller.scrollLeft ||
      left + tab.offsetWidth > scroller.scrollLeft + scroller.clientWidth
    ) {
      scroller.scrollLeft = left - 16;
    }
  }, [path]);

  return (
    <nav
      ref={nav}
      aria-label="Event"
      className="-mx-4 overflow-x-auto border-b border-rule [scrollbar-width:none] sm:mx-0 [&::-webkit-scrollbar]:hidden"
    >
      <div ref={strip} className="relative flex w-max min-w-full px-4 sm:px-0">
        {tabs.map(({ slug, label }) => {
          const href = slug ? `${base}/${slug}` : base;
          const active = slug
            ? path === href || path.startsWith(`${href}/`)
            : path === base;
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`caps step block px-2.5 py-3 text-[16px] sm:px-4 sm:text-[18px] ${
                active ? "text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {label}
            </Link>
          );
        })}
        <span
          aria-hidden
          className="tab-slide pointer-events-none absolute bottom-0 left-0 h-[3px] bg-you"
          style={{
            transform: `translateX(${rule?.x ?? 0}px)`,
            width: rule?.w ?? 0,
            opacity: rule ? 1 : 0,
          }}
        />
      </div>
    </nav>
  );
}
