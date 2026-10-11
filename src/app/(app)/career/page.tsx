import type { Metadata } from "next";
import Link from "next/link";
import { CareerPracticePanel } from "@/components/career-practice-panel";
import { MemberCareer } from "@/components/member-career";
import { PageTitle } from "@/components/page-title";
import { formatCount, formatPercent } from "@/lib/activity";
import { requireProfile } from "@/lib/auth";
import {
  CAREER_FILTERS,
  type CareerFilter,
  careerCounts,
  parseCareerFilter,
  parseCareerScope,
  parseCareerSort,
  starredIds,
} from "@/lib/career";
import { getCareerItems } from "@/lib/career-data";
import { practiceItems } from "@/lib/career-practice";

export const metadata: Metadata = { title: "Career" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "questions", label: "Questions" },
] as const;

// Two tabs: Overview (totals and practice) and Questions (every answer, with Show and Sort). The tab is in the URL,
// so a reload or a shared link lands on the same one.
export default async function CareerPage(props: PageProps<"/career">) {
  const [sp, profile] = await Promise.all([
    props.searchParams,
    requireProfile(),
  ]);
  const tab = sp.tab === "questions" ? "questions" : "overview";
  const rows = await getCareerItems(profile.id);
  const favorites = starredIds(rows);
  const counts = careerCounts(rows, favorites);
  const graded = rows.filter((r) => r.is_correct !== null);
  const accuracy = graded.length ? counts.right / graded.length : null;
  const tiles: [string, string][] = [
    ["Answered", formatCount(counts.all)],
    ["Right", formatCount(counts.right)],
    ["Accuracy", formatPercent(accuracy)],
    ["Favourites", formatCount(counts.favorites)],
  ];
  // The questions each practice set can use right now (the same rule the quiz and flashcards use).
  const practice = Object.fromEntries(
    CAREER_FILTERS.map((f) => [f, practiceItems(rows, f, favorites).length]),
  ) as Record<CareerFilter, number>;

  return (
    <div className="grid max-w-3xl gap-8">
      <PageTitle
        meta={
          rows.length >= 500
            ? "Your last 500 answers"
            : "Every question you've answered"
        }
      >
        Career
      </PageTitle>
      <nav aria-label="Career sections">
        <ul className="grid grid-cols-2 border-2 border-ink">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <li key={t.id} className="border-r border-ink last:border-r-0">
                <Link
                  href={
                    t.id === "overview" ? "/career" : "/career?tab=questions"
                  }
                  aria-current={on ? "page" : undefined}
                  className={`caps step flex h-12 items-center justify-center px-1 text-16 sm:h-14 sm:text-17 ${
                    on ? "bg-ink text-ground" : "text-ink hover:bg-band"
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "overview" ? (
        <>
          <dl className="grid grid-cols-2 border-2 border-ink sm:grid-cols-4">
            {tiles.map(([label, value], i) => (
              <div
                key={label}
                className={`grid gap-1 p-3 sm:p-4 ${i % 2 === 1 ? "border-l-2 border-ink" : ""} ${
                  i >= 2 ? "border-t-2 border-ink sm:border-t-0" : ""
                } ${i === 2 ? "sm:border-l-2" : ""}`}
              >
                <dt className="caps text-14 text-ink-2">{label}</dt>
                <dd className="num font-display text-[clamp(1.8rem,7vw,2.6rem)] leading-none font-bold">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <CareerPracticePanel counts={practice} />
          <p className="text-16 text-ink-2">
            Your totals and streaks are on your{" "}
            <Link
              href="/profile"
              className="text-ink underline underline-offset-4"
            >
              profile
            </Link>
            .
          </p>
        </>
      ) : (
        <MemberCareer
          rows={rows}
          initialFilter={parseCareerFilter(sp.result)}
          initialSort={parseCareerSort(sp.sort)}
          initialScope={parseCareerScope(sp)}
          canStar
        />
      )}
    </div>
  );
}
