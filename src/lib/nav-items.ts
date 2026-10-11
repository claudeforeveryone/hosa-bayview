// The app's navigation, as data. Pure, so which links each role sees is testable apart from the nav component.
import {
  CalendarDays,
  ClipboardCheck,
  LifeBuoy,
  Settings,
  ChartLine,
  Ellipsis,
  Grid2x2,
  House,
  LibraryBig,
  Medal,
  Megaphone,
  ChartNoAxesColumn,
  ShieldCheck,
  Trophy,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { BLC_ENABLED } from "@/lib/features";

// `chapter`: listed in the Chapter group (a dropdown in the sidebar). `bottom`: one of the phone shortcut bar's five.
// Settings, Help and Log out live in the More dropdown (MORE_ITEMS), so the panel stays short. Tests and Flashcards have no entry:
// their routes still work (deep links, classroom tabs).
export type NavItem = {
  href: string;
  label: string;
  short: string;
  Icon: LucideIcon;
  match: (p: string) => boolean;
  exec?: boolean;
  // Only the site owner (private.stats_viewers, 0105) sees this.
  stats?: boolean;
  chapter?: boolean;
  bottom?: boolean;
};

const ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    short: "Home",
    Icon: House,
    match: (p) => p === "/",
    bottom: true,
  },
  {
    href: "/events",
    label: "Events",
    short: "Events",
    Icon: Grid2x2,
    match: (p) =>
      p.startsWith("/events") ||
      p === "/c" ||
      p.startsWith("/c/") ||
      p.startsWith("/battle/"),
    bottom: true,
  },
  {
    href: "/career",
    label: "Career",
    short: "Career",
    Icon: ChartLine,
    match: (p) => p.startsWith("/career"),
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
    bottom: true,
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    short: "Ranks",
    Icon: Trophy,
    match: (p) => p.startsWith("/leaderboard"),
    chapter: true,
  },
  {
    href: "/blc",
    label: "BLC",
    short: "BLC",
    Icon: Medal,
    match: (p) => p.startsWith("/blc"),
    chapter: true,
  },
  {
    href: "/library",
    label: "Resources",
    short: "Resources",
    Icon: LibraryBig,
    match: (p) => p.startsWith("/library"),
    chapter: true,
  },
  {
    href: "/members",
    label: "Members",
    short: "Members",
    Icon: Users,
    match: (p) => p.startsWith("/members"),
    exec: true,
  },
  {
    href: "/profile",
    label: "Profile",
    short: "Profile",
    Icon: UserRound,
    match: (p) => p.startsWith("/profile"),
    bottom: true,
  },
  {
    href: "/admin",
    label: "Admin",
    short: "Admin",
    Icon: ShieldCheck,
    match: (p) => p.startsWith("/admin"),
    exec: true,
  },
  {
    href: "/developer",
    label: "Developer",
    short: "Dev",
    Icon: ChartNoAxesColumn,
    match: (p) => p.startsWith("/developer"),
    stats: true,
  },
  {
    href: "/more",
    label: "More",
    short: "More",
    Icon: Ellipsis,
    // Settings, Help and Attendance are reached from More, so it stays lit there.
    match: (p) =>
      p.startsWith("/more") ||
      p.startsWith("/settings") ||
      p.startsWith("/help") ||
      p.startsWith("/admin/attendance"),
    bottom: true,
  },
];

// `canSeeStats` is the developer stats viewer (the site owner), checked in the database too.
export function navItemsFor(isExec: boolean, canSeeStats = false): NavItem[] {
  return ITEMS.filter(
    (i) =>
      (!i.exec || isExec) &&
      (!i.stats || canSeeStats) &&
      (BLC_ENABLED || i.href !== "/blc"),
  );
}

// The phone shortcut bar: the five places people use most, More last.
export function bottomItemsFor(
  isExec: boolean,
  canSeeStats = false,
): NavItem[] {
  return navItemsFor(isExec, canSeeStats).filter((i) => i.bottom);
}

// "Join with a code" is for people who aren't in any event yet; after that, Settings > Events has it.
// Executives see every room already, so they never need it in the panel.
export function showJoinLink(isExec: boolean, roomCount: number): boolean {
  return !isExec && roomCount === 0;
}

// What the More dropdown holds (sidebar group and the phone bar's More sheet), above Log out.
const MORE_ITEMS: NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    short: "Settings",
    Icon: Settings,
    match: (p) => p.startsWith("/settings"),
  },
  {
    href: "/admin/attendance",
    label: "Attendance",
    short: "Attendance",
    Icon: ClipboardCheck,
    match: (p) => p.startsWith("/admin/attendance"),
    exec: true,
  },
  {
    href: "/help",
    label: "Help",
    short: "Help",
    Icon: LifeBuoy,
    match: (p) => p.startsWith("/help"),
  },
];

export function moreItemsFor(isExec: boolean): NavItem[] {
  return MORE_ITEMS.filter((i) => !i.exec || isExec);
}

// The phone bar's More sheet: every place the bar has no room for, then the More items.
export function sheetItemsFor(isExec: boolean, canSeeStats = false): NavItem[] {
  const onBar = new Set(bottomItemsFor(isExec).map((i) => i.href));
  return [
    ...navItemsFor(isExec, canSeeStats).filter((i) => !onBar.has(i.href) && i.href !== "/more"),
    ...moreItemsFor(isExec),
  ];
}
