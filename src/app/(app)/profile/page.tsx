import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { MemberCareer } from "@/components/member-career";
import { MemberStatRows } from "@/components/member-stats";
import { Button } from "@/components/form";
import { parseResult } from "@/lib/activity";
import { getCareer, getMemberStats } from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile" };

const ROLE_LABEL = { executive: "Executive", trainer: "Trainer", trainee: "Trainee" } as const;

export default async function ProfilePage(props: PageProps<"/profile">) {
  const sp = await props.searchParams;
  const result = parseResult(sp.result);
  const profile = await requireProfile();
  const [stats, career] = await Promise.all([getMemberStats(profile.id), getCareer(profile.id)]);
  return (
    <div className="grid max-w-2xl gap-10">
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
      {stats ? (
        <section aria-labelledby="numbers-h" className="grid gap-4">
          <h2 id="numbers-h" className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase">
            Your numbers
          </h2>
          <MemberStatRows stats={stats} />
        </section>
      ) : null}
      <section aria-labelledby="career-h" className="grid gap-4">
        <h2 id="career-h" className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase">
          Career
        </h2>
        <MemberCareer rows={career} result={result} basePath="/profile" />
      </section>
      <form action={logout}>
        <Button variant="line" type="submit">
          <LogOut size={20} strokeWidth={1.75} aria-hidden />
          Log out
        </Button>
      </form>
    </div>
  );
}
