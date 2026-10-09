import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { MemberStatRows, RecentBonuses } from "@/components/member-stats";
import {
  getMemberDetails,
  getMemberStats,
  getRecentBonuses,
} from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";
import { roleLabel } from "@/lib/role-label";
import { gradeLabel } from "@/lib/profile";

export const metadata: Metadata = { title: "Member" };

// Any signed-in member can see another member's numbers. Emails never leave the database for this page.
export default async function MemberPage(props: PageProps<"/members/[id]">) {
  const { id } = await props.params;
  await requireProfile();
  const [stats, details] = await Promise.all([
    getMemberStats(id),
    getMemberDetails(),
  ]);
  if (!stats) notFound();
  // A failed bonus lookup leaves the line out rather than failing the profile.
  const bonuses = await getRecentBonuses(id).catch(() => []);
  const detail = details.get(stats.user_id);

  return (
    <div className="grid max-w-2xl gap-8">
      <header className="flex items-center gap-5">
        <Avatar
          name={stats.full_name || "Member"}
          src={detail?.avatar_url ?? null}
          size="lg"
        />
        <div className="grid min-w-0 gap-2">
          <h1 className="font-display text-[clamp(2.5rem,8vw,4.5rem)] leading-none font-bold [overflow-wrap:anywhere] uppercase">
            {stats.full_name || "Member"}
          </h1>
          <p className="caps text-[17px] text-ink-2">
            {roleLabel(stats.role, detail?.title)}
            <span aria-hidden> · </span>
            <span className="normal-case">
              {gradeLabel(detail?.grade ?? null)}
            </span>
          </p>
        </div>
      </header>
      <MemberStatRows stats={stats} />
      <RecentBonuses rows={bonuses} />
      <Link
        href="/members"
        className="caps step justify-self-start text-[17px] underline underline-offset-4"
      >
        All members
      </Link>
    </div>
  );
}
