import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { AppearanceSection, SoundSection } from "@/components/appearance";
import { Button } from "@/components/form";
import { JoinForm } from "@/components/join-form";
import { PageTitle } from "@/components/page-title";
import { SettingsSection } from "@/components/settings-section";
import { requireProfile } from "@/lib/auth";
import { AVATAR_MAX_BYTES, gifLimitBytes } from "@/lib/avatar";
import { avatarSources } from "@/lib/avatar-urls";
import { SETTINGS_TABS, resolveSettingsTab } from "@/lib/settings-tabs";
import { createClient } from "@/lib/supabase/server";
import {
  GradeSection,
  NameSection,
  PasswordSection,
  PictureSection,
} from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const [profile, sp] = await Promise.all([requireProfile(), searchParams]);
  const tab = resolveSettingsTab(sp.tab);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageTitle meta={profile.email}>Settings</PageTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        {/* Phones: one row of tabs that scrolls sideways when it runs out of width. Desktop: a rail on the left. */}
        <nav
          aria-label="Settings sections"
          className="min-w-0 lg:sticky lg:top-6 lg:self-start"
        >
          <ul className="flex overflow-x-auto border-2 border-ink lg:flex-col lg:overflow-visible">
            {SETTINGS_TABS.map((t) => {
              const on = t.id === tab;
              return (
                <li
                  key={t.id}
                  className="shrink-0 border-r border-ink last:border-r-0 lg:border-r-0 lg:border-b lg:last:border-b-0"
                >
                  <Link
                    href={`/settings?tab=${t.id}`}
                    aria-current={on ? "page" : undefined}
                    className={`caps step flex min-h-12 items-center px-5 text-[16px] sm:text-[18px] lg:min-h-14 ${
                      on ? "bg-ink text-ground" : "text-ink hover:bg-band"
                    }`}
                  >
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">
          {tab === "appearance" ? <AppearanceSection /> : null}
          {tab === "sound" ? <SoundSection /> : null}
          {tab === "account" ? <AccountTab /> : null}
          {tab === "events" ? (
            <EventsTab isExec={profile.role === "executive"} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Executive access is given by the chapter leads from /admin (0101), so there's no passcode section here.
async function AccountTab() {
  const profile = await requireProfile();
  const picture = (await avatarSources([profile.avatar_path])).get(
    profile.avatar_path ?? "",
  );
  // GIF pictures are for a few named accounts (0101), not every executive.
  const supabase = await createClient();
  const [powers, exempt] = await Promise.all([
    supabase.rpc("my_powers"),
    supabase.rpc("gif_exempt_ids"),
  ]);
  if (exempt.error)
    throw new Error(`GIF limits lookup failed: ${exempt.error.message}`);
  const canGif = Boolean((powers.data as { gif: boolean }[] | null)?.[0]?.gif);
  const gifLimit = canGif
    ? gifLimitBytes(((exempt.data ?? []) as string[]).includes(profile.id))
    : AVATAR_MAX_BYTES;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
      <NameSection name={profile.full_name} />
      <GradeSection grade={profile.grade} />
      <PictureSection
        userId={profile.id}
        name={profile.full_name}
        src={picture ?? null}
        hasPicture={profile.avatar_path !== null}
        animated={canGif}
        gifLimit={gifLimit}
      />
      <PasswordSection />
      <SettingsSection
        id="logout-h"
        title="Log out"
        description="Signs you out on this device."
      >
        <form action={logout}>
          <Button variant="line" type="submit">
            <LogOut size={20} strokeWidth={1.75} aria-hidden />
            Log out
          </Button>
        </form>
      </SettingsSection>
    </div>
  );
}

function EventsTab({ isExec }: { isExec: boolean }) {
  return (
    <SettingsSection
      id="events-h"
      title="Events"
      description="Join an event with its code, or find the events you are already in."
    >
      {/* The join form is drawn for the navy field, so it sits in a field panel here too. */}
      <div className="grid gap-4 bg-field p-5 text-on-field sm:p-6">
        <p className="font-display text-[26px] leading-none font-bold uppercase">
          Join another event
        </p>
        <p className="text-[16px] text-on-field-2">
          Ask the event&apos;s trainer for its code.
        </p>
        <JoinForm />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <Link
          href="/events"
          className="caps step inline-flex h-12 items-center text-[16px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink"
        >
          See your events
        </Link>
        {isExec ? (
          <Link
            href="/admin/attendance"
            className="caps step press inline-flex h-12 items-center border-2 border-ink px-5 text-[16px] hover:bg-band"
          >
            Attendance
          </Link>
        ) : null}
      </div>
    </SettingsSection>
  );
}
