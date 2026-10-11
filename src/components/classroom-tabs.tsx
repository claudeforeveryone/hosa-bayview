"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type FocusEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  type Category,
  type Tab,
  tabClearScroll,
  tabFocusScroll,
  tabsFor,
} from "@/lib/classroom-tabs";
import { prefersCalm } from "@/lib/motion";

const tabClass =
  "caps step block px-2.5 py-3 text-16 focus-visible:-outline-offset-2 sm:px-4 sm:text-18";

// The edge chevrons are 40 px wide, so a tab scrolled into view sits 48 px in from either side.
const CLEAR = 48;

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
    scroller.scrollBy({
      left: dir * scroller.clientWidth * 0.6,
      behavior: prefersCalm() ? "auto" : "smooth",
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

  // On phones the strip scrolls; keep a tab on screen and clear of the edge chevrons.
  const keepClear = (tab: HTMLElement | null | undefined) => {
    const scroller = nav.current;
    if (!scroller || !tab) return;
    const to = tabClearScroll({
      scrollLeft: scroller.scrollLeft,
      width: scroller.clientWidth,
      left: tab.offsetLeft,
      right: tab.offsetLeft + tab.offsetWidth,
      edge: CLEAR,
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
  // of them (the browser alone leaves a tab under a chevron when a sliver of it shows). A click or tap also
  // focuses the link, on press: moving the strip then would lose the tap, so only keyboard focus moves it.
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const scroller = nav.current;
    if (!scroller || !(e.target instanceof HTMLElement)) return;
    const to = tabFocusScroll(e.target, scroller, CLEAR);
    if (to !== null) scroller.scrollLeft = to;
  };
  const edge =
    "step absolute top-0 bottom-px z-10 grid w-10 place-items-center bg-ground text-ink-2 hover:text-ink";
  return (
    <div className="relative -mx-4 sm:mx-0">
      <nav
        ref={nav}
        aria-label="Event"
        onFocus={onFocus}
        className="overflow-x-auto border-b border-rule [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          ref={strip}
          className="relative flex w-max min-w-full px-4 sm:px-0"
        >
          {tabs.map((tab) => {
            if (tab.sub)
              return (
                <QuestionsTab key={tab.label} tab={tab} base={base} path={path} />
              );
            const { slug, label } = tab;
            const href = slug ? `${base}/${slug}` : base;
            const active = slug
              ? path === href || path.startsWith(`${href}/`)
              : path === base;
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                // The ring sits inside the tab: the scrolling strip would clip its top and bottom.
                className={`${tabClass} ${
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

// Tests and Cards under one tab. The menu is a popover, so it sits in the top layer and the strip's
// sideways scroll can't clip it; it opens under the tab and closes on a pick, a tap outside, Escape or a scroll.
// While you're on one of its pages the tab carries the rule (aria-current) and names the page after Questions.
function QuestionsTab({
  tab,
  base,
  path,
}: {
  tab: Tab;
  base: string;
  path: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const id = `${base.replaceAll("/", "-")}-questions`;
  const sub = tab.sub ?? [];
  // Some older browsers throw when hiding a popover that isn't open.
  const hide = () => {
    try {
      menu.current?.hidePopover?.();
    } catch {}
  };
  const hrefOf = (slug: string) => `${base}/${slug}`;
  const current = sub.find(
    (t) => path === hrefOf(t.slug) || path.startsWith(`${hrefOf(t.slug)}/`),
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => hide(), [path]);

  // A fixed menu would drift from its tab when anything scrolls, so it closes instead.
  useEffect(() => {
    if (!at) return;
    const close = hide;
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [at]);

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    // Under the tab, kept on screen with a 16 px gutter.
    const width = 224;
    const left = Math.max(16, Math.min(r.left, window.innerWidth - width - 16));
    setAt({ top: r.bottom, left });
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        onClick={place}
        aria-haspopup="menu"
        aria-current={current ? "page" : undefined}
        className={`${tabClass} flex items-center gap-1.5 ${
          current ? "text-ink" : "text-ink-2 hover:text-ink"
        }`}
      >
        {tab.label}
        {current ? (
          <span className="font-sans text-15 font-normal tracking-normal normal-case sm:text-16">
            · {current.label}
          </span>
        ) : null}
        <ChevronDown size={18} strokeWidth={2} aria-hidden />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        onToggle={(e) => {
          if ((e as unknown as { newState?: string }).newState === "closed")
            setAt(null);
        }}
        style={
          at
            ? { position: "fixed", inset: "auto", top: at.top, left: at.left, margin: 0 }
            : undefined
        }
        className="w-56 border-[3px] border-ink bg-ground p-0 text-ink"
      >
        <ul role="menu" aria-label={tab.label}>
          {sub.map((t) => {
            const on = t === current;
            return (
              <li key={t.slug} role="none" className="border-t border-rule first:border-t-0">
                <Link
                  role="menuitem"
                  href={hrefOf(t.slug)}
                  aria-current={on ? "page" : undefined}
                  onClick={() => hide()}
                  className={`caps step flex h-12 items-center justify-between px-4 text-17 ${
                    on ? "bg-ink text-ground" : "hover:bg-band"
                  }`}
                >
                  {t.label}
                  {on ? <Check size={18} strokeWidth={2.25} aria-hidden /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
