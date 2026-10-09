import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { MemberStatRows } from "@/components/member-stats";
import { getMemberDetails, getMemberStats } from "@/lib/activity-data";
import { requireProfile, type Role } from "@/lib/auth";
import { gradeLabel } from "@/lib/profile";

export const metadata: Metadata = { title: "Member" };

const ROLE_LABEL = {
  executive: "Executive",
  trainer: "Trainer",
  trainee: "Trainee",
} satisfies Record<Role, string>;

// Any signed-in member can see another member's numbers. Emails never leave the database for this page.
export default async function MemberPage(props: PageProps<"/members/[id]">) {
  const { id } = await props.params;
  await requireProfile();
  const [stats, details] = await Promise.all([
    getMemberStats(id),
    getMemberDetails(),
  ]);
  if (!stats) notFound();
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
            {ROLE_LABEL[stats.role]}
            <span aria-hidden> · </span>
            <span className="normal-case">
              {gradeLabel(detail?.grade ?? null)}
            </span>
          </p>
        </div>
      </header>
      <MemberStatRows stats={stats} />
      <Link
        href="/members"
        className="caps step justify-self-start text-[17px] underline underline-offset-4"
      >
        All members
      </Link>
    </div>
  );
}
