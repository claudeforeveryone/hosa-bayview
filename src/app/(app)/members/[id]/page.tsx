import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { MemberStatRows, RecentBonuses } from "@/components/member-stats";
import {
  getMemberDetail,
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
  const me = await requireProfile();
  // One member's picture, grade and title (0206); the bulk list only carries grade and title for yourself.
  const [stats, detail] = await Promise.all([
    getMemberStats(id),
    getMemberDetail(id),
  ]);
  if (!stats) notFound();
  // A failed bonus lookup leaves the line out rather than failing the profile.
  const bonuses = await getRecentBonuses(id).catch(() => []);

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
          <p className="caps text-17 text-ink-2">
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
      {/* The full list is for executives (0204); everyone else goes back to the board they came from. */}
      <Link
        href={me.role === "executive" ? "/members" : "/leaderboard"}
        className="caps step justify-self-start text-17 underline underline-offset-4"
      >
        {me.role === "executive" ? "All members" : "Leaderboard"}
      </Link>
    </div>
  );
}
