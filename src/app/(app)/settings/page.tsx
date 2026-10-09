import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/form";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import { avatarSources } from "@/lib/avatar-urls";
import { createClient } from "@/lib/supabase/server";
import {
  ClaimAdminSection,
  DemoSection,
  GradeSection,
  NameSection,
  PasscodeSection,
  PasswordSection,
  PictureSection,
  type PasscodeNotice,
} from "./forms";

const NOTICES: PasscodeNotice[] = ["wrong", "slow", "retry"];

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const [profile, sp] = await Promise.all([requireProfile(), searchParams]);
  const picture = (await avatarSources([profile.avatar_path])).get(
    profile.avatar_path ?? "",
  );
  const isExec = profile.role === "executive";
  let passcodeSet = false;
  let demoOn = false;
  let isDemo = false;
  if (isExec) {
    const supabase = await createClient();
    const [passcode, demo, me] = await Promise.all([
      supabase.rpc("admin_passcode_is_set"),
      supabase.rpc("demo_login_enabled"),
      supabase.rpc("am_demo"),
    ]);
    isDemo = me.data !== false;
    if (passcode.error)
      throw new Error(`Passcode lookup failed: ${passcode.error.message}`);
    passcodeSet = Boolean(passcode.data);
    demoOn = Boolean(demo.data);
  }

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle meta={profile.email}>Settings</PageTitle>
      <div className="grid grid-cols-1 gap-10">
        <NameSection name={profile.full_name} />
        <GradeSection grade={profile.grade} />
        <PictureSection
          userId={profile.id}
          name={profile.full_name}
          src={picture ?? null}
          hasPicture={profile.avatar_path !== null}
        />
        <PasswordSection />
        {isExec && !isDemo ? <DemoSection enabled={demoOn} /> : null}
        {isDemo ? null : isExec ? (
          <PasscodeSection isSet={passcodeSet} />
        ) : (
          <ClaimAdminSection
            notice={NOTICES.find((n) => n === sp.passcode) ?? null}
          />
        )}
        <section className="border-t border-rule pt-6">
          <form action={logout}>
            <Button variant="line" type="submit">
              <LogOut size={20} strokeWidth={1.75} aria-hidden />
              Log out
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
