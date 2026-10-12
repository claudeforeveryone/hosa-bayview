"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRef } from "react";
import { useDisclosureClose } from "@/hooks/use-disclosure-close";

// A board choice ("Ranked by Elo", "All time") with the alternatives one tap away. A native disclosure; the
// script closes it on a pick, an outside tap, Escape, or focus moving elsewhere. A pick changes the board in
// place (no page load), so the reader stays where they were on the page.
export function BoardMenu({
  label,
  lead,
  current,
  items,
  onPick,
  align = "start",
}: {
  label: string; // names the menu for screen readers
  lead?: string; // quiet words before the choice, e.g. "Ranked by"
  current: string;
  items: { value: string; text: string }[];
  onPick: (value: string) => void;
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useDisclosureClose(ref);

  const on = items.find((i) => i.value === current) ?? items[0];
  return (
    <nav aria-label={label}>
      <details ref={ref} className="board-menu group relative">
        <summary className="caps step flex min-h-11 cursor-pointer list-none items-center gap-2 text-14 select-none sm:text-15 [&::-webkit-details-marker]:hidden">
          {lead ? <span className="text-ink-2">{lead}</span> : null}
          <span className="text-ink underline decoration-rule-strong decoration-2 underline-offset-[6px] group-open:decoration-ink group-hover:decoration-ink">
            {on?.text}
          </span>
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden
            className="text-ink-2 group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
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
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    // Close and hand focus back to the toggle, so keyboard users stay on the menu.
                    const el = ref.current;
                    if (el) {
                      el.open = false;
                      el.querySelector("summary")?.focus();
                    }
                    if (!active) onPick(item.value);
                  }}
                  className={`caps flex min-h-11 w-full items-center justify-between gap-6 px-4 text-left text-14 transition-colors duration-100 hover:bg-band focus-visible:-outline-offset-2 ${
                    active ? "text-ink" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {item.text}
                  {active ? (
                    <Check size={16} strokeWidth={2.25} aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </nav>
  );
}
