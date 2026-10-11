import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { MemberStatRows } from "@/components/member-stats";
import { SkillStrip } from "@/components/skill-badges";
import { Button } from "@/components/form";
import { formatCount } from "@/lib/activity";
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
import { formatWhen } from "@/lib/when";
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
  const right = career.filter((r) => r.is_correct === true).length;
  const wrong = career.filter((r) => r.is_correct === false).length;
  const starred = new Set(
    career.filter((r) => r.favorite && r.question_id).map((r) => r.question_id),
  ).size;
  const recent = career.slice(0, 3);
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
      <section aria-labelledby="career-h" className="grid gap-4">
        <h2 id="career-h" className={H2}>
          Career
        </h2>
        <ul aria-label="Career totals" className="grid grid-cols-3 border-2 border-ink">
          {(
            [
              ["Right", formatCount(right), "/career?result=right"],
              ["Wrong", formatCount(wrong), "/career?result=wrong"],
              ["Favourites", formatCount(starred), "/career?result=favorites"],
            ] as const
          ).map(([label, value, href], i) => (
            <li key={label} className={i ? "border-l-2 border-ink" : ""}>
              <Link href={href} className="grid h-full gap-1 p-3 hover:bg-band sm:p-4">
                <span className="caps text-14 text-ink-2">{label}</span>
                <span className="num font-display text-[clamp(1.6rem,6vw,2.2rem)] leading-none font-bold">
                  {value}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {recent.length ? (
          <ol className="grid gap-2">
            {recent.map((item, i) => (
              <li
                key={`${item.answered_at}-${i}`}
                className={`grid gap-1 border border-l-[6px] border-rule-strong p-3 ${
                  item.is_correct === null
                    ? "border-l-rule-strong"
                    : item.is_correct
                      ? "border-l-ok"
                      : "border-l-danger"
                }`}
              >
                <p className="flex flex-wrap gap-x-3 text-14 text-ink-2">
                  <span className={`caps font-semibold ${item.is_correct === null ? "" : item.is_correct ? "text-ok" : "text-danger"}`}>
                    {item.is_correct === null ? "Answered" : item.is_correct ? "Right" : "Wrong"}
                  </span>
                  <span className="num">{formatWhen(item.answered_at)}</span>
                </p>
                <p className="line-clamp-2 text-17 leading-snug">{item.prompt}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-17 text-ink-2">
            No questions answered yet. Practise a test and every answer shows up in your career.
          </p>
        )}
        <Link
          href="/career"
          className="caps step inline-flex h-12 items-center justify-between gap-3 bg-ink px-4 text-17 text-ground hover:bg-ink-2"
        >
          {career.length
            ? `Open career: all ${formatCount(career.length)}`
            : "Open career"}
          <ArrowRight size={20} strokeWidth={2} aria-hidden />
        </Link>
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
