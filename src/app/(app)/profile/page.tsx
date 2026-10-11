import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { MemberStatRows } from "@/components/member-stats";
import { SkillStrip } from "@/components/skill-badges";
import { Button } from "@/components/form";
import { getMemberStats } from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";
import { AVATAR_MAX_BYTES, gifLimitBytes } from "@/lib/avatar";
import { getBattleWins } from "@/lib/battles";
import { avatarSources } from "@/lib/avatar-urls";
import { getCareerItems } from "@/lib/career-data";
import { gradeLabel } from "@/lib/profile";
import { roleLabel } from "@/lib/role-label";
import { chapterSkills } from "@/lib/skills-data";
import { createClient } from "@/lib/supabase/server";
import { AvatarButton } from "./avatar-button";
import { NameEdit } from "./name-edit";

export const metadata: Metadata = { title: "Profile" };

const H2 =
  "border-b-[3px] border-ink pb-2 font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase";

// GIF pictures are for a few named accounts (0101). Returns whether this account may use one, and its size cap
// as on Settings (exempt accounts keep the bucket limit).
async function gifAccess(userId: string): Promise<{ canGif: boolean; gifLimit: number }> {
  const supabase = await createClient();
  const [powers, exempt] = await Promise.all([supabase.rpc("my_powers"), supabase.rpc("gif_exempt_ids")]);
  if (exempt.error) throw new Error(`GIF limits lookup failed: ${exempt.error.message}`);
  const canGif = Boolean((powers.data as { gif: boolean }[] | null)?.[0]?.gif);
  return {
    canGif,
    gifLimit: canGif ? gifLimitBytes(((exempt.data ?? []) as string[]).includes(userId)) : AVATAR_MAX_BYTES,
  };
}

export default async function ProfilePage() {
  const profile = await requireProfile();
  const [stats, career, sources, wins, { canGif, gifLimit }] = await Promise.all([
    getMemberStats(profile.id),
    getCareerItems(profile.id),
    avatarSources([profile.avatar_path]),
    // Null until the battle migrations are applied; the row stays hidden then.
    getBattleWins(profile.id),
    gifAccess(profile.id),
  ]);
  const picture = profile.avatar_path
    ? (sources.get(profile.avatar_path) ?? null)
    : null;
  // The same skills as /skills, from the reads this page already made.
  const skills = chapterSkills(stats, career, wins);
  return (
    <div className="grid max-w-2xl gap-10">
      <div className="flex items-center gap-5">
        <AvatarButton
          userId={profile.id}
          name={profile.full_name}
          src={picture}
          hasPicture={Boolean(profile.avatar_path)}
          animated={canGif}
          gifLimit={gifLimit}
        />
        <div className="min-w-0 flex-1">
          <NameEdit name={profile.full_name} />
          <p className="mt-1 text-ink-2 [overflow-wrap:anywhere]">
            {profile.email}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 border-2 border-ink bg-band p-4">
        <dt className="caps text-ink-2">Role</dt>
        <dd>{roleLabel(profile.role, profile.title)}</dd>
        <dt className="caps text-ink-2">Grade</dt>
        <dd>{gradeLabel(profile.grade)}</dd>
        <dt className="caps text-ink-2">Member since</dt>
        <dd className="num">
          {new Date(profile.created_at).toLocaleDateString("en-CA", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </dd>
        {wins !== null ? (
          <>
            <dt className="caps text-ink-2">Battle wins</dt>
            <dd className="num">{wins}</dd>
          </>
        ) : null}
      </dl>
      <section aria-labelledby="skills-h" className="grid gap-4">
        <h2 id="skills-h" className={H2}>
          Skills
        </h2>
        <SkillStrip list={skills} />
      </section>
      {stats ? (
        <section aria-labelledby="numbers-h" className="grid gap-4">
          <h2 id="numbers-h" className={H2}>
            Your numbers
          </h2>
          <MemberStatRows stats={stats} />
        </section>
      ) : null}
      <form action={logout}>
        <Button variant="line" type="submit">
          <LogOut size={20} strokeWidth={1.75} aria-hidden />
          Log out
        </Button>
      </form>
    </div>
  );
}
