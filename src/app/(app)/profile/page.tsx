import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/form";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile" };

const ROLE_LABEL = { executive: "Executive", trainer: "Trainer", trainee: "Trainee" } as const;

export default async function ProfilePage() {
  const profile = await requireProfile();
  return (
    <div className="grid max-w-2xl gap-8">
      <div>
        <h1 className="font-display text-[clamp(2.5rem,8vw,4.5rem)] leading-none font-bold uppercase">
          {profile.full_name}
        </h1>
        <p className="mt-2 text-ink-2">{profile.email}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 border-y border-rule py-4">
        <dt className="caps text-ink-2">Role</dt>
        <dd>{ROLE_LABEL[profile.role]}</dd>
        <dt className="caps text-ink-2">Member since</dt>
        <dd className="num">
          {new Date(profile.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}
        </dd>
      </dl>
      <form action={logout}>
        <Button variant="line" type="submit">
          <LogOut size={20} strokeWidth={1.75} aria-hidden />
          Log out
        </Button>
      </form>
    </div>
  );
}
