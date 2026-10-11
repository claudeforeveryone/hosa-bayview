"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Category, tabClearScroll, tabsFor } from "@/lib/classroom-tabs";

// Condensed caps tabs; one "you" rule slides under the active tab. Scrolls sideways on phones.
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
  // On a phone the later tabs sit off screen. A solid edge with a chevron shows there is more that way.
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const scroller = nav.current;
    if (!scroller) return;
    const check = () =>
      setMore({
        left: scroller.scrollLeft > 4,
        right:
          scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4,
      });
    check();
    // Tab widths settle once the display face has loaded.
    void document.fonts?.ready.then(check);
    scroller.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      scroller.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const nudge = (dir: 1 | -1) => {
    const scroller = nav.current;
    if (!scroller) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollBy({
      left: dir * scroller.clientWidth * 0.6,
      behavior: reduce ? "auto" : "smooth",
    });
  };

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

  // On phones the strip scrolls; keep a tab on screen and clear of the edge chevrons (40 px each, so 48 px).
  const keepClear = (tab: HTMLElement | null | undefined) => {
    const scroller = nav.current;
    if (!scroller || !tab) return;
    const to = tabClearScroll({
      scrollLeft: scroller.scrollLeft,
      width: scroller.clientWidth,
      left: tab.offsetLeft,
      right: tab.offsetLeft + tab.offsetWidth,
      edge: 48,
    });
    if (to !== null) scroller.scrollLeft = to;
  };

  // The current tab, on arrival and on every tab change.
  useEffect(() => {
    keepClear(
      strip.current?.querySelector<HTMLElement>('[aria-current="page"]'),
    );
  }, [path]);

  // Pointer-only cues: the chevrons stay out of the tab order, and a tab that gets keyboard focus scrolls clear
  // of them (the browser alone leaves a tab under a chevron when a sliver of it shows).
  const edge =
    "step absolute top-0 bottom-px z-10 grid w-10 place-items-center bg-ground text-ink-2 hover:text-ink";
  return (
    <div className="relative -mx-4 sm:mx-0">
      <nav
        ref={nav}
        aria-label="Event"
        onFocus={(e) => keepClear(e.target as HTMLElement)}
        className="overflow-x-auto border-b border-rule [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          ref={strip}
          className="relative flex w-max min-w-full px-4 sm:px-0"
        >
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
            // A 1px bar stretched to the tab's width, so the glide is a transform only (no layout per frame).
            className="tab-slide pointer-events-none absolute bottom-0 left-0 h-[3px] w-px origin-left bg-you-line"
            style={{
              transform: `translateX(${rule?.x ?? 0}px) scaleX(${rule?.w ?? 0})`,
              opacity: rule ? 1 : 0,
            }}
          />
        </div>
      </nav>
      {more.left ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => nudge(-1)}
          className={`${edge} left-0 border-r border-rule`}
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
      ) : null}
      {more.right ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => nudge(1)}
          className={`${edge} right-0 border-l border-rule`}
        >
          <ChevronRight size={20} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
