"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

// A board choice ("Ranked by Elo", "All time") with the alternatives one tap away. A native disclosure of
// plain links, so it opens and navigates before any script loads; the script closes it on a pick, an outside
// tap, Escape, or focus moving elsewhere.
export function BoardMenu({
  label,
  lead,
  current,
  items,
  align = "start",
}: {
  label: string; // names the menu for screen readers
  lead?: string; // quiet words before the choice, e.g. "Ranked by"
  current: string;
  items: { value: string; text: string; href: string }[];
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        const inside = el.contains(document.activeElement);
        el.open = false;
        if (inside) el.querySelector("summary")?.focus();
      } else if (!el.contains(e.target as Node)) {
        // A tap elsewhere, or focus tabbing past the last item.
        el.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("focusin", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("focusin", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  const on = items.find((i) => i.value === current) ?? items[0];
  return (
    <nav aria-label={label}>
      <details ref={ref} className="board-menu group relative">
        <summary className="caps step flex min-h-11 cursor-pointer list-none items-center gap-2 text-[14px] select-none sm:text-[15px] [&::-webkit-details-marker]:hidden">
          {lead ? <span className="text-ink-2">{lead}</span> : null}
          <span className="text-ink underline decoration-rule-strong decoration-2 underline-offset-[6px] group-open:decoration-ink group-hover:decoration-ink">
            {on?.text}
          </span>
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden
            className="text-ink-2 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-180"
          />
        </summary>
        <ul
          className={`board-menu-panel absolute top-full z-20 mt-1 grid min-w-52 border border-ink bg-ground py-1.5 ${
            align === "end"
              ? "right-0 origin-top-right"
              : "left-0 origin-top-left"
          }`}
        >
          {items.map((item) => {
            const active = item.value === current;
            return (
              <li key={item.value}>
                <Link
                  href={item.href}
                  aria-current={active ? "true" : undefined}
                  onClick={(e) => {
                    // Close and hand focus back to the toggle, so keyboard users aren't dropped to the page top.
                    // Leave it open for a new-tab click.
                    const el = ref.current;
                    if (!el || e.metaKey || e.ctrlKey || e.shiftKey) return;
                    el.open = false;
                    el.querySelector("summary")?.focus();
                  }}
                  className={`caps flex min-h-11 items-center justify-between gap-6 px-4 text-[14px] transition-colors duration-100 hover:bg-band focus-visible:-outline-offset-2 ${
                    active ? "text-ink" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {item.text}
                  {active ? (
                    <Check size={16} strokeWidth={2.25} aria-hidden />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </details>
    </nav>
  );
}
