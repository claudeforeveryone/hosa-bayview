import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/form";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClaimAdminSection, NameSection, PasscodeSection, PasswordSection, type PasscodeNotice } from "./forms";

const NOTICES: PasscodeNotice[] = ["wrong", "slow", "retry"];

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const [profile, sp] = await Promise.all([requireProfile(), searchParams]);
  const isExec = profile.role === "executive";
  let passcodeSet = false;
  if (isExec) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_passcode_is_set");
    if (error) throw new Error(`Passcode lookup failed: ${error.message}`);
    passcodeSet = Boolean(data);
  }

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle meta={profile.email}>Settings</PageTitle>
      <div className="grid grid-cols-1 gap-10">
        <NameSection name={profile.full_name} />
        <PasswordSection />
        {isExec ? <PasscodeSection isSet={passcodeSet} /> : <ClaimAdminSection notice={NOTICES.find((n) => n === sp.passcode) ?? null} />}
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
