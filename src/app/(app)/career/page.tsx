import type { Metadata } from "next";
import Link from "next/link";
import { MemberCareer } from "@/components/member-career";
import { PageTitle } from "@/components/page-title";
import { formatCount, formatPercent } from "@/lib/activity";
import { requireProfile } from "@/lib/auth";
import { parseCareerFilter, parseCareerSort } from "@/lib/career";
import { getCareerItems } from "@/lib/career-data";

export const metadata: Metadata = { title: "Career" };

export default async function CareerPage(props: PageProps<"/career">) {
  const [sp, profile] = await Promise.all([props.searchParams, requireProfile()]);
  const rows = await getCareerItems(profile.id);
  const graded = rows.filter((r) => r.is_correct !== null);
  const right = graded.filter((r) => r.is_correct).length;
  const accuracy = graded.length ? right / graded.length : null;
  const starred = new Set(rows.filter((r) => r.favorite && r.question_id).map((r) => r.question_id)).size;
  const tiles: [string, string][] = [
    ["Answered", formatCount(rows.length)],
    ["Right", formatCount(right)],
    ["Accuracy", formatPercent(accuracy)],
    ["Favourites", formatCount(starred)],
  ];
  return (
    <div className="grid max-w-3xl gap-8">
      <PageTitle meta={rows.length >= 500 ? "Your last 500 answers" : "Every question you've answered"}>
        Career
      </PageTitle>
      <dl className="grid grid-cols-2 border-2 border-ink sm:grid-cols-4">
        {tiles.map(([label, value], i) => (
          <div
            key={label}
            className={`grid gap-1 p-3 sm:p-4 ${i % 2 === 1 ? "border-l-2 border-ink" : ""} ${
              i >= 2 ? "border-t-2 border-ink sm:border-t-0" : ""
            } ${i === 2 ? "sm:border-l-2" : ""}`}
          >
            <dt className="caps text-[14px] text-ink-2">{label}</dt>
            <dd className="num font-display text-[clamp(1.8rem,7vw,2.6rem)] leading-none font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <MemberCareer
        rows={rows}
        initialFilter={parseCareerFilter(sp.result)}
        initialSort={parseCareerSort(sp.sort)}
        canStar
      />
      <p className="text-[16px] text-ink-2">
        Your totals and streaks are on your{" "}
        <Link href="/profile" className="text-ink underline underline-offset-4">
          profile
        </Link>
        .
      </p>
    </div>
  );
}
