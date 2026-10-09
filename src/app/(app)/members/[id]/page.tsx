import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberStatRows } from "@/components/member-stats";
import { getMemberStats } from "@/lib/activity-data";
import { requireProfile, type Role } from "@/lib/auth";

export const metadata: Metadata = { title: "Member" };

const ROLE_LABEL = { executive: "Executive", trainer: "Trainer", trainee: "Trainee" } satisfies Record<Role, string>;

// Any signed-in member can see another member's numbers. Emails never leave the database for this page.
export default async function MemberPage(props: PageProps<"/members/[id]">) {
  const { id } = await props.params;
  await requireProfile();
  const stats = await getMemberStats(id);
  if (!stats) notFound();

  return (
    <div className="grid max-w-2xl gap-8">
      <header className="grid gap-2">
        <h1 className="font-display text-[clamp(2.5rem,8vw,4.5rem)] leading-none font-bold [overflow-wrap:anywhere] uppercase">
          {stats.full_name}
        </h1>
        <p className="caps text-[17px] text-ink-2">{ROLE_LABEL[stats.role]}</p>
      </header>
      <MemberStatRows stats={stats} />
      <Link href="/members" className="caps step justify-self-start text-[17px] underline underline-offset-4">
        All members
      </Link>
    </div>
  );
}
