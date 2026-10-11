import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/form";
import { getProfile } from "@/lib/auth";
import { banStatus, banWhen } from "@/lib/moderation";

export const metadata: Metadata = { title: "Banned" };

// Where requireProfile sends a banned member. Reads the profile directly, so it can't bounce back here.
export default async function BannedPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const status = banStatus(profile.banned_until, new Date());
  if (!status.banned) redirect("/");

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-[clamp(2.75rem,10vw,4.5rem)] leading-[0.92] font-bold uppercase">
        Banned
      </h1>
      <p className="text-18">Your account is banned {banWhen(status)}.</p>
      {profile.ban_reason ? (
        <div className="grid gap-1 border-t border-rule pt-4">
          <p className="caps text-15 text-ink-2">Reason</p>
          <p className="text-17 [overflow-wrap:anywhere]">
            {profile.ban_reason}
          </p>
        </div>
      ) : null}
      <p className="text-17 text-ink-2">
        You can&apos;t use the site until the ban ends.
      </p>
      <form action={logout}>
        <Button variant="line" type="submit">
          <LogOut size={20} strokeWidth={1.75} aria-hidden />
          Log out
        </Button>
      </form>
    </div>
  );
}
