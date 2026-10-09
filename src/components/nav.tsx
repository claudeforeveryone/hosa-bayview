"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, UserRound, type LucideIcon } from "lucide-react";

// Decks (phase 4) and Admin (phase 6) are added here when their pages exist.
const ITEMS: { href: string; label: string; Icon: LucideIcon; match: (p: string) => boolean; exec?: boolean }[] = [
  { href: "/", label: "Home", Icon: House, match: (p) => p === "/" || p.startsWith("/c/") },
  { href: "/profile", label: "Profile", Icon: UserRound, match: (p) => p.startsWith("/profile") },
];

function useItems(isExec: boolean) {
  const path = usePathname();
  return ITEMS.filter((i) => !i.exec || isExec).map((i) => ({ ...i, active: i.match(path) }));
}

// Desktop: condensed caps tabs, active one underlined in maroon.
export function TopNav({ isExec }: { isExec: boolean }) {
  const items = useItems(isExec);
  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="flex">
        {items.map(({ href, label, active }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`caps step block border-b-[3px] px-4 py-2 text-[19px] ${
                active ? "border-you text-ink" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Phone: fixed navy bar; the active glyph fills.
export function BottomNav({ isExec }: { isExec: boolean }) {
  const items = useItems(isExec);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 bg-field text-on-field lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {items.map(({ href, label, Icon, active }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`step flex h-16 flex-col items-center justify-center gap-1 border-t-[3px] ${
                active ? "border-you text-on-field" : "border-transparent text-on-field-2"
              }`}
            >
              <Icon size={24} strokeWidth={1.75} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.25 : 0} />
              <span className="caps text-[13px] leading-none">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
