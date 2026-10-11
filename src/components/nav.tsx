"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, LogOut, Menu, Plus, X } from "lucide-react";
import { ClassicLogo } from "@/components/classic-logo";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Credit } from "@/components/credit";
import { formNumber } from "@/lib/join-code";
import { logout } from "@/app/(auth)/actions";
import {
  bottomItemsFor,
  moreItemsFor,
  navItemsFor,
  sheetItemsFor,
  showJoinLink,
} from "@/lib/nav-items";

export type NavRoom = { id: string; num: number; name: string };
type Props = {
  isExec: boolean;
  canSeeStats: boolean;
  canTeach: boolean;
  rooms: NavRoom[];
  unread: number;
};

function useItems(isExec: boolean, canSeeStats: boolean) {
  const path = usePathname();
  const withActive = (list: ReturnType<typeof navItemsFor>) =>
    list.map((i) => ({ ...i, active: i.match(path) }));
  return {
    path,
    items: withActive(navItemsFor(isExec, canSeeStats)),
    bottom: withActive(bottomItemsFor(isExec)),
    more: withActive(moreItemsFor(isExec)),
    sheet: withActive(sheetItemsFor(isExec)),
  };
}

const row = "step flex h-12 items-center gap-3 px-5 lg:px-6";
const rowState = (active: boolean) =>
  active
    ? "bg-on-field text-field"
    : "text-on-field-2 hover:bg-field-2 hover:text-on-field";

// A collapsible group in the panel.
function Group({
  title,
  open,
  children,
}: {
  title: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group/nav mt-6">
      <summary className="caps nav-label step mx-5 flex h-11 cursor-pointer list-none items-center justify-between border-b-2 border-on-field/50 text-[14px] text-on-field-2 hover:text-on-field lg:mx-6 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          size={18}
          strokeWidth={2}
          aria-hidden
          className="transition-transform group-open/nav:rotate-180"
        />
      </summary>
      {children}
    </details>
  );
}

// The whole app in one column: where to go and the classrooms you are in.
function PanelBody({ isExec, canSeeStats, canTeach, rooms }: Props) {
  const { path, items, more } = useItems(isExec, canSeeStats);
  const link = ({ href, label, Icon, active }: (typeof items)[number]) => (
    <li key={href}>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`${row} ${rowState(active)}`}
      >
        <Icon size={22} strokeWidth={1.75} aria-hidden />
        <span className="caps nav-label text-[19px]">{label}</span>
      </Link>
    </li>
  );
  const chapter = items.filter((i) => i.chapter);
  const roomActive = (id: string) =>
    path === `/c/${id}` || path.startsWith(`/c/${id}/`);
  const join = showJoinLink(isExec, rooms.length);
  // A short list stays open; a long one (executives see every room) folds unless you're in one of them.
  const roomsOpen =
    rooms.length <= 5 ||
    rooms.some((r) => roomActive(r.id)) ||
    path === "/c/new";
  return (
    <>
      <nav aria-label="Main">
        <ul>{items.filter((i) => !i.chapter && i.href !== "/more").map(link)}</ul>
        {/* Chapter pages are everyday stops, so the group always starts open. */}
        <Group title="Chapter" open>
          <ul className="mt-1">{chapter.map(link)}</ul>
        </Group>
      </nav>

      <section aria-label="Your events">
        <Group
          title={rooms.length ? `Your events (${rooms.length})` : "Your events"}
          open={roomsOpen}
        >
          <ul className="mt-1">
            {rooms.map((room) => {
              const active = roomActive(room.id);
              return (
                <li key={room.id}>
                  <Link
                    href={`/c/${room.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`${row} justify-between ${rowState(active)}`}
                  >
                    <span className="truncate text-[17px] font-medium">
                      {room.name}
                    </span>
                    <span className="num caps shrink-0 text-[13px] opacity-80">
                      {formNumber("C", room.num)}
                    </span>
                  </Link>
                </li>
              );
            })}
            {join ? (
              <li>
                <Link
                  href="/join"
                  aria-current={path === "/join" ? "page" : undefined}
                  className={`${row} ${rowState(path === "/join")}`}
                >
                  <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
                  <span className="text-[17px] font-medium">
                    Join with a code
                  </span>
                </Link>
              </li>
            ) : null}
            {canTeach ? (
              <li>
                <Link
                  href="/c/new"
                  aria-current={path === "/c/new" ? "page" : undefined}
                  className={`${row} ${rowState(path === "/c/new")}`}
                >
                  <Plus size={20} strokeWidth={1.75} aria-hidden />
                  <span className="text-[17px] font-medium">New classroom</span>
                </Link>
              </li>
            ) : null}
          </ul>
        </Group>
      </section>

      <Group title="More" open={more.some((i) => i.active) || path === "/more"}>
        <ul className="mt-1">
          {more.map(link)}
          <li>
            <form action={logout}>
              <button type="submit" className={`${row} w-full ${rowState(false)}`}>
                <LogOut size={22} strokeWidth={1.75} aria-hidden />
                <span className="caps nav-label text-[19px]">Log out</span>
              </button>
            </form>
          </li>
        </ul>
      </Group>
    </>
  );
}

// Desktop: the navy column that holds the logo, navigation and your rooms. Its foot (credit and theme) sticks to the
// bottom, so the page footer leaves the credit to it; the scroll padding keeps a focused link clear of that foot.
export function Sidebar(props: Props) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[18rem] shrink-0 scroll-pb-20 flex-col overflow-y-auto bg-field text-on-field lg:flex">
      <div className="flex items-start justify-between gap-2 pt-6 pr-3 pb-8 pl-6">
        <Link href="/" aria-label="HOSA Bayview home" className="block">
          <ClassicLogo className="h-[136px]" />
        </Link>
        <NotificationBell
          initial={props.unread}
          className="-mt-1 text-on-field-2 hover:text-on-field aria-[current=page]:text-on-field"
        />
      </div>
      <PanelBody {...props} />
      <div className="sticky bottom-0 mt-auto flex items-end justify-between gap-3 border-t border-on-field-2/40 bg-field px-6 pt-4 pb-5">
        <Credit className="text-on-field-2" />
        <ThemeToggle className="-mr-3 -mb-2 text-on-field-2 hover:text-on-field" />
      </div>
    </aside>
  );
}

// Phone: logo bar on top, the same panel in a drawer behind the menu button.
export function MobileBar(props: Props) {
  const drawer = useRef<HTMLDialogElement>(null);
  const path = usePathname();

  useEffect(() => {
    drawer.current?.close();
  }, [path]);

  // Past the phone breakpoint the drawer's header is hidden; never leave it open (and the page locked) there.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 64rem)");
    const onChange = () => wide.matches && drawer.current?.close();
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  // Home's banner is the logo there, so the bar doesn't repeat it.
  const home = path === "/";

  return (
    <header
      className={`flex items-start gap-4 px-4 lg:hidden ${home ? "justify-end py-1" : "justify-between pt-3"}`}
    >
      {home ? null : (
        <Link href="/" aria-label="HOSA Bayview home" className="text-ink">
          <ClassicLogo className="h-[96px]" />
        </Link>
      )}
      <div className="flex items-center">
        <NotificationBell initial={props.unread} className="text-ink" />
        <ThemeToggle className="text-ink" />
        <button
          type="button"
          onClick={() => drawer.current?.showModal()}
          aria-label="Open menu"
          aria-haspopup="dialog"
          className="grid size-11 place-items-center text-ink"
        >
          <Menu size={26} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <dialog
        ref={drawer}
        aria-label="Menu"
        onClick={(e) => {
          // Backdrop taps and link taps both close it.
          const target = e.target as HTMLElement;
          if (target === drawer.current || target.closest("a"))
            drawer.current?.close();
        }}
        className="drawer m-0 h-dvh max-h-none border-0 p-0 w-[min(20rem,86vw)] max-w-none overflow-y-auto bg-field text-on-field backdrop:bg-[#0f2440]/60"
      >
        <div className="flex min-h-full flex-col">
          <div className="flex items-start justify-between px-5 pt-3 pb-6">
            <ClassicLogo className="h-[80px]" />
            <button
              type="button"
              onClick={() => drawer.current?.close()}
              aria-label="Close menu"
              className="-mr-2 grid size-11 place-items-center text-on-field"
            >
              <X size={26} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <PanelBody {...props} />
          <Credit className="mt-auto border-t border-on-field-2/40 px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-on-field-2" />
        </div>
      </dialog>
    </header>
  );
}

// Phone: fixed navy bar with the five main places; the active glyph fills. More opens a sheet with the rest.
export function BottomNav({ isExec }: { isExec: boolean }) {
  const { path, bottom, sheet } = useItems(isExec, false);
  const sheetRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    sheetRef.current?.close();
  }, [path]);

  const tab = (active: boolean) =>
    `step flex h-16 w-full flex-col items-center justify-center gap-1 border-t-[3px] ${
      active ? "border-you text-on-field" : "border-transparent text-on-field-2"
    }`;
  const glyph = (active: boolean) => ({
    size: 24,
    strokeWidth: 1.75,
    fill: active ? "currentColor" : "none",
    fillOpacity: active ? 0.25 : 0,
    "aria-hidden": true,
  });

  return (
    <nav
      aria-label="Shortcuts"
      className="fixed inset-x-0 bottom-0 z-40 bg-field text-on-field lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {bottom.map(({ href, short, Icon, active }) => (
          <li key={href}>
            {href === "/more" ? (
              <button
                type="button"
                onClick={() => sheetRef.current?.showModal()}
                aria-haspopup="dialog"
                className={tab(active)}
              >
                <Icon {...glyph(active)} />
                <span className="caps text-[13px] leading-none">{short}</span>
              </button>
            ) : (
              <Link href={href} aria-current={active ? "page" : undefined} className={tab(active)}>
                <Icon {...glyph(active)} />
                <span className="caps text-[13px] leading-none">{short}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
      <dialog
        ref={sheetRef}
        aria-label="More"
        onClick={(e) => {
          // Backdrop taps and link taps both close it.
          const target = e.target as HTMLElement;
          if (target === sheetRef.current || target.closest("a")) sheetRef.current?.close();
        }}
        className="sheet m-0 mt-auto max-h-[80dvh] w-full max-w-none overflow-y-auto border-0 border-t-[3px] border-on-field bg-field p-0 text-on-field backdrop:bg-[#0f2440]/60"
      >
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <h2 className="caps text-[15px] text-on-field-2">More</h2>
          <button
            type="button"
            onClick={() => sheetRef.current?.close()}
            aria-label="Close"
            className="-mr-2 grid size-11 place-items-center"
          >
            <X size={24} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <ul className="pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {sheet.map(({ href, label, Icon, active }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`${row} h-14 ${rowState(active)}`}
              >
                <Icon size={22} strokeWidth={1.75} aria-hidden />
                <span className="caps nav-label text-[19px]">{label}</span>
              </Link>
            </li>
          ))}
          <li className="mt-1 border-t border-on-field-2/40">
            <form action={logout}>
              <button type="submit" className={`${row} h-14 w-full text-on-field-danger hover:bg-field-2`}>
                <LogOut size={22} strokeWidth={1.75} aria-hidden />
                <span className="caps nav-label text-[19px]">Log out</span>
              </button>
            </form>
          </li>
        </ul>
      </dialog>
    </nav>
  );
}
