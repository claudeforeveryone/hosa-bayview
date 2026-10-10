// The app's navigation, as data. Pure, so which links each role sees is testable apart from the nav component.
import {
  CalendarDays,
  Grid2x2,
  House,
  LibraryBig,
  Medal,
  Megaphone,
  Settings,
  ShieldCheck,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { BLC_ENABLED } from "@/lib/features";

// `more`: sidebar and drawer only, not the phone shortcut bar. `chapter`: listed under Chapter.
// Leaderboard, Tests and Flashcards have no entry: their routes still work (deep links, classroom tabs).
export type NavItem = {
  href: string;
  label: string;
  short: string;
  Icon: LucideIcon;
  match: (p: string) => boolean;
  exec?: boolean;
  more?: boolean;
  chapter?: boolean;
};

const ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    short: "Home",
    Icon: House,
    match: (p) => p === "/",
  },
  {
    href: "/events",
    label: "Events",
    short: "Events",
    Icon: Grid2x2,
    match: (p) => p.startsWith("/events") || p === "/c" || p.startsWith("/c/"),
  },
  {
    href: "/announcements",
    label: "Announcements",
    short: "News",
    Icon: Megaphone,
    match: (p) => p.startsWith("/announcements"),
    chapter: true,
  },
  {
    href: "/calendar",
    label: "Calendar",
    short: "Calendar",
    Icon: CalendarDays,
    match: (p) => p.startsWith("/calendar"),
    chapter: true,
  },
  {
    href: "/blc",
    label: "BLC",
    short: "BLC",
    Icon: Medal,
    match: (p) => p.startsWith("/blc"),
    more: true,
    chapter: true,
  },
  {
    href: "/library",
    label: "Resources",
    short: "Resources",
    Icon: LibraryBig,
    match: (p) => p.startsWith("/library"),
    more: true,
    chapter: true,
  },
  {
    href: "/members",
    label: "Members",
    short: "Members",
    Icon: Users,
    match: (p) => p.startsWith("/members"),
    exec: true,
    more: true,
  },
  {
    href: "/profile",
    label: "Profile",
    short: "Profile",
    Icon: UserRound,
    match: (p) => p.startsWith("/profile"),
  },
  {
    href: "/settings",
    label: "Settings",
    short: "Settings",
    Icon: Settings,
    match: (p) => p.startsWith("/settings"),
    more: true,
  },
  {
    href: "/admin",
    label: "Admin",
    short: "Admin",
    Icon: ShieldCheck,
    match: (p) => p.startsWith("/admin"),
    exec: true,
  },
];

export function navItemsFor(isExec: boolean): NavItem[] {
  return ITEMS.filter(
    (i) => (!i.exec || isExec) && (BLC_ENABLED || i.href !== "/blc"),
  );
}

// The phone shortcut bar: the five places people use most.
export function bottomItemsFor(isExec: boolean): NavItem[] {
  return navItemsFor(isExec).filter((i) => !i.exec && !i.more);
}
