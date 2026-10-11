import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { LookSection, SoundSection } from "@/components/appearance";
import { Button } from "@/components/form";
import { JoinForm } from "@/components/join-form";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import { AVATAR_MAX_BYTES, gifLimitBytes } from "@/lib/avatar";
import { avatarSources } from "@/lib/avatar-urls";
import { createClient } from "@/lib/supabase/server";
import { GradeSection, NameSection, PasswordSection, PictureSection } from "./forms";

const TABS = [
  { id: "look", label: "Look" },
  { id: "sound", label: "Sound" },
  { id: "account", label: "Account" },
  { id: "events", label: "Events" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const [profile, sp] = await Promise.all([requireProfile(), searchParams]);
  const tab: Tab = TABS.find((t) => t.id === sp.tab)?.id ?? "look";

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle meta={profile.email}>Settings</PageTitle>
      {/* Four equal links in one heavy frame: fits a phone's width without scrolling, thumb-sized. */}
      <nav aria-label="Settings sections">
        <ul className="grid grid-cols-4 border-2 border-ink">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <li key={t.id} className="border-r border-ink last:border-r-0">
                <Link
                  href={`/settings?tab=${t.id}`}
                  aria-current={on ? "page" : undefined}
                  className={`caps step flex h-12 items-center justify-center px-1 text-[15px] sm:h-14 sm:text-[17px] ${
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
      {tab === "look" ? <LookSection /> : null}
      {tab === "sound" ? <SoundSection /> : null}
      {tab === "account" ? <AccountTab /> : null}
      {tab === "events" ? (
        <EventsTab isExec={profile.role === "executive"} />
      ) : null}
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
    <div className="grid grid-cols-1 gap-10">
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
      <section className="border-t-[3px] border-ink pt-5">
        <form action={logout}>
          <Button variant="line" type="submit">
            <LogOut size={20} strokeWidth={1.75} aria-hidden />
            Log out
          </Button>
        </form>
      </section>
    </div>
  );
}

function EventsTab({ isExec }: { isExec: boolean }) {
  return (
    <section
      aria-labelledby="events-h"
      className="grid grid-cols-1 gap-5 border-t-[3px] border-ink pt-5 lg:grid-cols-[16rem_minmax(0,32rem)]"
    >
      <h2
        id="events-h"
        className="font-display text-[clamp(1.75rem,5vw,2.25rem)] leading-none font-bold uppercase"
      >
        Events
      </h2>
      <div className="grid gap-4">
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
        <Link
          href="/events"
          className="caps step inline-flex h-11 items-center justify-self-start text-[15px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink"
        >
          See your events
        </Link>
        {isExec ? (
          <Link
            href="/admin/attendance"
            className="caps step press inline-flex h-12 items-center justify-self-start border-2 border-ink px-5 text-[16px] hover:bg-band"
          >
            Attendance
          </Link>
        ) : null}
      </div>
    </section>
  );
}
