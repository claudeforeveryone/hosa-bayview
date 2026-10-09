import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle meta="All of HOSA Bayview">Leaderboard</PageTitle>
      <EmptyState title="Nothing ranked yet" />
    </div>
  );
}
