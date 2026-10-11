import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { SkillBoard } from "@/components/skill-badges";
import { requireProfile } from "@/lib/auth";
import { getMySkills } from "@/lib/skills-data";

export const metadata: Metadata = { title: "Skills" };

// Badges earned across the whole chapter. Each event's Questions > Skills shows the same idea for that event.
export default async function SkillsPage() {
  const profile = await requireProfile();
  const list = await getMySkills(profile.id);
  return (
    <div className="grid max-w-4xl grid-cols-[minmax(0,1fr)] gap-8">
      <PageTitle meta="Badges you earn by studying, four tiers each">Skills</PageTitle>
      <SkillBoard list={list} scope="All of HOSA Bayview" />
      <p className="text-15 text-ink-2">
        Skills update as you study. Streaks, perfect days and comebacks look at your last 500 answers.
      </p>
    </div>
  );
}
