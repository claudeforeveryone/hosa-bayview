"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, Plus, X } from "lucide-react";
import { ClassicLogo } from "@/components/classic-logo";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Credit } from "@/components/credit";
import { formNumber } from "@/lib/join-code";
import { bottomItemsFor, navItemsFor } from "@/lib/nav-items";

export type NavRoom = { id: string; num: number; name: string };
type Props = {
  isExec: boolean;
  canTeach: boolean;
  rooms: NavRoom[];
  unread: number;
};

function useItems(isExec: boolean) {
  const path = usePathname();
  const withActive = (list: ReturnType<typeof navItemsFor>) =>
    list.map((i) => ({ ...i, active: i.match(path) }));
  return {
    path,
    items: withActive(navItemsFor(isExec)),
    bottom: withActive(bottomItemsFor(isExec)),
  };
}

const row = "step flex h-12 items-center gap-3 px-5 lg:px-6";
const rowState = (active: boolean) =>
  active
    ? "bg-on-field text-field"
    : "text-on-field-2 hover:bg-field-2 hover:text-on-field";

// The whole app in one column: where to go and the classrooms you are in.
function PanelBody({ isExec, canTeach, rooms }: Props) {
  const { path, items } = useItems(isExec);
  const roomsHeading = useId();
  const chapterHeading = useId();
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
  return (
    <>
      <nav aria-label="Main">
        <ul>{items.filter((i) => !i.chapter).map(link)}</ul>
        <h2
          id={chapterHeading}
          className="caps nav-label mx-5 mt-8 border-b border-on-field-2/40 pb-2 text-[14px] text-on-field-2 lg:mx-6"
        >
          Chapter
        </h2>
        <ul className="mt-1" aria-labelledby={chapterHeading}>
          {items.filter((i) => i.chapter).map(link)}
        </ul>
      </nav>

      <section aria-labelledby={roomsHeading} className="mt-8">
        <h2
          id={roomsHeading}
          className="caps nav-label mx-5 border-b border-on-field-2/40 pb-2 text-[14px] text-on-field-2 lg:mx-6"
        >
          Your events
        </h2>
        <ul className="mt-1">
          {rooms.map((room) => {
            const active =
              path === `/c/${room.id}` || path.startsWith(`/c/${room.id}/`);
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
          <li>
            <Link
              href="/join"
              aria-current={path === "/join" ? "page" : undefined}
              className={`${row} ${rowState(path === "/join")}`}
            >
              <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
              <span className="text-[17px] font-medium">Join with a code</span>
            </Link>
          </li>
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
      </section>
    </>
  );
}

// Desktop: the navy column that holds the logo, navigation and your rooms.
export function Sidebar(props: Props) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[18rem] shrink-0 flex-col overflow-y-auto bg-field text-on-field lg:flex">
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
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-on-field-2/40 px-6 pt-4 pb-5">
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

// Phone: fixed navy bar with the five main places; the active glyph fills.
export function BottomNav({ isExec }: { isExec: boolean }) {
  const { bottom } = useItems(isExec);
  return (
    <nav
      aria-label="Shortcuts"
      className="fixed inset-x-0 bottom-0 z-40 bg-field text-on-field lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {bottom.map(({ href, short, Icon, active }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`step flex h-16 flex-col items-center justify-center gap-1 border-t-[3px] ${
                active
                  ? "border-you text-on-field"
                  : "border-transparent text-on-field-2"
              }`}
            >
              <Icon
                size={24}
                strokeWidth={1.75}
                fill={active ? "currentColor" : "none"}
                fillOpacity={active ? 0.25 : 0}
                aria-hidden
              />
              <span className="caps text-[13px] leading-none">{short}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
