import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  ClipboardCheck,
  LifeBuoy,
  LogOut,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import { bottomItemsFor, navItemsFor } from "@/lib/nav-items";

export const metadata: Metadata = { title: "More" };

// Big tap rows inside a framed box: one thumb, no hunting.
const rowClass =
  "step flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left hover:bg-band sm:px-5";

function Row({
  href,
  Icon,
  label,
  hint,
}: {
  href: string;
  Icon: LucideIcon;
  label: string;
  hint?: string;
}) {
  return (
    <li className="border-t border-rule first:border-t-0">
      <Link href={href} className={rowClass}>
        <Icon size={24} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span className="grid min-w-0 flex-1">
          <span className="caps text-[19px] leading-tight">{label}</span>
          {hint ? (
            <span className="text-[15px] text-ink-2">{hint}</span>
          ) : null}
        </span>
        <ChevronRight
          size={20}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 text-ink-2"
        />
      </Link>
    </li>
  );
}

const SETTINGS_TABS = [
  { tab: "look", label: "Look" },
  { tab: "sound", label: "Sound" },
  { tab: "account", label: "Account" },
  { tab: "events", label: "Join an event" },
];

export default async function MorePage() {
  const profile = await requireProfile();
  const isExec = profile.role === "executive";
  // Everything the phone bar has no room for, so this page reaches every section on its own.
  const onBar = new Set(bottomItemsFor(isExec).map((i) => i.href));
  const elsewhere = navItemsFor(isExec).filter((i) => !onBar.has(i.href));

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle meta="Settings, help and everything else">More</PageTitle>

      <section aria-labelledby="you-h" className="grid gap-3">
        <h2
          id="you-h"
          className="caps border-b-[3px] border-ink pb-2 text-[16px]"
        >
          You
        </h2>
        <ul className="border-2 border-ink">
          <Row
            href="/settings"
            Icon={Settings}
            label="Settings"
            hint="Look, sound, your account, joining events"
          />
          <li className="border-t border-rule px-4 pt-1 pb-4 sm:px-5">
            <ul className="flex flex-wrap gap-2" aria-label="Settings tabs">
              {SETTINGS_TABS.map((t) => (
                <li key={t.tab}>
                  <Link
                    href={`/settings?tab=${t.tab}`}
                    className="caps step inline-flex h-11 items-center border border-ink px-4 text-[15px] hover:bg-band"
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
          {isExec ? (
            <Row
              href="/admin/attendance"
              Icon={ClipboardCheck}
              label="Attendance"
              hint="Mark who came, every event"
            />
          ) : null}
          <Row
            href="/help"
            Icon={LifeBuoy}
            label="Help"
            hint="How things work and who to ask"
          />
          <li className="border-t-2 border-ink">
            <form action={logout}>
              <button type="submit" className={`${rowClass} text-danger`}>
                <LogOut
                  size={24}
                  strokeWidth={1.75}
                  aria-hidden
                  className="shrink-0"
                />
                <span className="caps flex-1 text-[19px] leading-tight">
                  Log out
                </span>
              </button>
            </form>
          </li>
        </ul>
      </section>

      {elsewhere.length ? (
        <section aria-labelledby="go-h" className="grid gap-3">
          <h2
            id="go-h"
            className="caps border-b-[3px] border-ink pb-2 text-[16px]"
          >
            Go to
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {elsewhere.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="step flex h-full min-h-24 flex-col justify-between gap-3 border-2 border-ink bg-band p-4 hover:bg-ink hover:text-ground"
                >
                  <Icon size={26} strokeWidth={1.75} aria-hidden />
                  <span className="caps text-[17px] leading-tight">
                    {label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
